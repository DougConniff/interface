import { expect, test } from 'playwright/fixtures'
import { stubTradingApiEndpoint } from 'playwright/fixtures/tradingApi'
import { Mocks } from 'playwright/mocks/mocks'
import { DAI, USDC_MAINNET } from 'uniswap/src/constants/tokens'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { Experiments } from 'uniswap/src/features/gating/experiments'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { assume0xAddress } from 'utils/wagmi'

test.describe('Fees', () => {
  test('should not display fee on swaps without fees', async ({ page }) => {
    await page.goto(`/swap?inputCurrency=${DAI.address}&outputCurrency=${USDC_MAINNET.address}`)

    // Enter amount
    await page.getByTestId(TestID.AmountInputOut).fill('1')

    // Verify fee UI
    await page.getByTestId(TestID.GasInfoRow).click()
    // Verify there is no "fee" text:
    const locator = page.locator('Fee')
    await expect(locator).toHaveCount(0)
  })

  test('swaps ETH for USDC exact-in with swap fee', async ({ page, anvil }) => {
    await stubTradingApiEndpoint({ page, endpoint: uniswapUrls.tradingApiPaths.swap })

    await page.goto(`/swap?inputCurrency=ETH&outputCurrency=${USDC_MAINNET.address}`)

    // Set up swap
    await page.getByTestId(TestID.AmountInputOut).fill('1')

    const response = await page.waitForResponse('https://trading-api-labs.interface.gateway.uniswap.org/v1/quote')
    const {
      quote: { portionBips, portionRecipient },
    } = await response.json()

    const portionRecipientBalance = await anvil.getErc20Balance(assume0xAddress(USDC_MAINNET.address), portionRecipient)

    // Initiate transaction
    await page.getByTestId(TestID.ReviewSwap).click()

    // Verify fee percentage and amount is displayed
    await page.getByText(`Fee (${portionBips / 100}%)`)
    await page.getByTestId(TestID.Swap).click()

    // Verify fee recipient received fee
    const finalRecipientBalance = await anvil.getErc20Balance(assume0xAddress(USDC_MAINNET.address), portionRecipient)
    await expect(finalRecipientBalance).toBeGreaterThan(portionRecipientBalance)
  })

  test('displays UniswapX fee in UI', async ({ page }) => {
    await stubTradingApiEndpoint({ page, endpoint: uniswapUrls.tradingApiPaths.swap })

    await page.goto(
      `/swap?inputCurrency=ETH&outputCurrency=${DAI.address}&experimentOverride=${Experiments.PriceUxUpdate}`,
    )

    await page.route(`${uniswapUrls.tradingApiUrl}${uniswapUrls.tradingApiPaths.quote}`, async (route, request) => {
      const postData = await request.postData()
      const data = JSON.parse(postData ?? '{}')
      if (data.tokenOut === USDC_MAINNET.address) {
        await route.continue()
      } else {
        await route.fulfill({ path: Mocks.UniswapX.quote })
      }
    })

    // Set up swap
    await page.getByTestId(TestID.AmountInputOut).fill('1')
    // Verify fee UI
    await page.getByTestId(TestID.GasInfoRow).click()
    // Pseudo check to verify that the swap label is visible and the fee is $0:
    await expect(page.getByText('Swap network cost')).toBeVisible()
    await expect(page.getByText('Free')).toBeVisible()
  })
})
