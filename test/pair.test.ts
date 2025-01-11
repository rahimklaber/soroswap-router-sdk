import { Pair } from '../src/entities/pair'; // Adjust the import path as needed
import { createToken } from './router.test';
import { CurrencyAmount } from '../src/index';
import JSBI from 'jsbi';

const XLM_TOKEN = createToken("XLM_ADDRESS")
const USDC_TOKEN = createToken("USDC_ADDRESS")

describe('Pair', () => {
    describe('Phoenix', () => {
        let pair: Pair;

        beforeEach(() => {
            pair = new Pair(
                CurrencyAmount.fromRawAmount(XLM_TOKEN, "8291494350066"), // Mocked reserve0
                CurrencyAmount.fromRawAmount(USDC_TOKEN, "706515116511") // Mocked reserve1
            );
        });

        it('should correctly calculate the output amount for Phoenix protocol', () => {
            // Arrange

            const inputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, 100_000_0000000); // Mocked input amount

            const [outputAmount, _] = pair.getOutputAmountPhoenix(inputAmount);

            const expectedOutputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, "75810794757");
            expect(outputAmount).toEqual(expectedOutputAmount);
        });

        it('should correctly calculate the output amount for Phoenix protocol', () => {
            // Arrange

            const inputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, 10_000_0000000); // Mocked input amount

            const [outputAmount, _] = pair.getOutputAmountPhoenix(inputAmount);

            const expectedOutputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, "8394161299");
            expect(outputAmount).toEqual(expectedOutputAmount);
        });

        it('should correctly calculate the input amount for Phoenix protocol', () => {
            const outputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, 1_0000000); // Mocked output amount
            const [inputAmount, _] = pair.getInputAmountPhoenix(outputAmount);

            const expectedInputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, "117712438");
            expect(inputAmount.quotient).toEqual(expectedInputAmount.quotient);
            expect(inputAmount.equalTo(expectedInputAmount)).toBe(true);
        });
    });
    describe('Aquarius', () => {
        let pair: Pair;
        beforeEach(() => {
            pair = new Pair(
                CurrencyAmount.fromRawAmount(XLM_TOKEN, "10995320835786"), // Mocked reserve0
                CurrencyAmount.fromRawAmount(USDC_TOKEN, "1029760349373") // Mocked reserve1
            );
        });
        it('should correctly calculate the output amount for Aquarius protocol', () => {

            const inputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, 100_000_0000000); // Mocked input amount

            const [outputAmount, _] = pair.getOutputAmountAquarius(inputAmount);

            const expectedOutputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, "85589296224");
            expect(outputAmount.quotient.toString()).toEqual(expectedOutputAmount.quotient.toString());
            expect(outputAmount.equalTo(expectedOutputAmount)).toBe(true);
        });

        it('should correctly calculate the input amount for Aquarius protocol', () => {

            const outputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, 1_0000000); // Mocked output amount
            const [inputAmount, _] = pair.getInputAmountAquarius(outputAmount);

            const expectedInputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, "107097864");
            expect(inputAmount.quotient.toString()).toEqual(expectedInputAmount.quotient.toString());
            expect(inputAmount.equalTo(expectedInputAmount)).toBe(true);
        });
    });
    describe('Comet', () => {
        let pair: Pair;
        beforeEach(() => {
            pair = new Pair(
                CurrencyAmount.fromRawAmount(XLM_TOKEN, "800000000000"),
                CurrencyAmount.fromRawAmount(USDC_TOKEN, "200000000000"),
                30,
                {weightA: JSBI.BigInt(800000000000), weightB: JSBI.BigInt(200000000000)}
            );
        });
        it('should correctly calculate the output amount for Comet protocol', () => {

            const inputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, 1_000_000);

            const [outputAmount, _] = pair.getOutputAmountComet(inputAmount);

            // bone = 10**18
            // fee_ratio = (10**7 - 30000) * 10**11 => 997000000000000000
            // scaled_reserve_(out|in) = token_(out|in)_reserve * 10**7
            // adjusted_in = amount_in * fee_ratio / BONE
            // base = (scaled_reserve_in * BONE) / (scaled_reserve_in + adjusted_in) 
            // weight_ratio = in_token_weight * 10**18 / out_token_weight
            // power = ((base / BONE) ** (weight_ratio / BONE)) * BONE // The code treats the numbers as 18 digit fixed point values. So code does it differently, but this is equivalent
            // balance_ratio = BONE - power
            // <= scaled_reserve_out * balance_ratio / BONE / 10**7

            // scaled_reserve_in = 800000000000 * 10**7 => 8000000000000000000
            // scaled_reserve_out = 200000000000 * 10**7 => 2000000000000000000
            // adjusted_in = 1_000_000 * 997000000000000000 / BONE => 99700000000000000
            // base = (8000000000000000000 * BONE) / (8000000000000000000 + 99700000000000000) => 999998753751553137
            // weight_ratio = 8000000 * bone / 2000000 => 4000000000000000000
            // power = ((999998753751553137 / BONE) ** (4000000000000000000 / BONE)) * 10**18 => 999995015015531351
            // balance_ratio = BONE - 999995015015531351 => 4984984468649
            // 2000000000000000000 * 4984984468649 / BONE / 10**7 => 996996

            const expectedOutputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, "996996");
            expect(outputAmount.quotient.toString()).toEqual(expectedOutputAmount.quotient.toString());
            expect(outputAmount.equalTo(expectedOutputAmount)).toBe(true);
        });
        it('should correctly calculate the input amount for Comet protocol', () => {

            const outputAmount = CurrencyAmount.fromRawAmount(USDC_TOKEN, 1_000_000);

            const [inputAmount, _] = pair.getInputAmountComet(outputAmount);

            // bone = 10**18
            // fee_ratio = (10**7 - 30000) * 10**11 => 997000000000000000
            // scaled_reserve_(out|in) = token_(out|in)_reserve * 10**7
            // adjusted_out = amount_out * 10**7
            // base = (scaled_reserve_out * BONE) / (scaled_reserve_out) - adjusted_out) 
            // weight_ratio = out_token_weight * 10**18 / out_token_weight
            // power = ((base / BONE) ** (weight_ratio / BONE)) * BONE // The code treats the numbers as 18 digit fixed point values. So code does it differently, but this is equivelant
            // balance_ratio = power - BONE
            // amount_in = scaled_reserve_in * balance_ratio / BONE
            // adjusted_in = amount_in * BONE / fee_ratio
            // <= adjusted_in / 10**7

            // scaled_reserve_in = 800000000000 * 10**7 => 8000000000000000000
            // scaled_reserve_out = 200000000000 * 10**7 => 2000000000000000000
            // adjusted_out = 1_000_000 * 10**7 => 10000000000000
            // base = (2000000000000000000 * BONE) / (2000000000000000000 - 10000000000000) => 1000005000025000125
            // weight_ratio = 2000000 * BONE / 8000000 => 250000000000000000
            // power = ((1000005000025000125 / BONE) ** (250000000000000000 / BONE)) * 10**18 => 1250006250031
            // balance_ratio = 1000001250006250031 - BONE => 1250006250031
            // amount_in = 8000000000000000000 * 1250006250031 / BONE = 10000050000248
            // adjusted_in = 10000050000248 * BONE / fee_ratio => 10030140421512
            // 10030140421512 / 10**7 => 1003015

            const expectedInputAmount = CurrencyAmount.fromRawAmount(XLM_TOKEN, "1003015");
            expect(inputAmount.quotient.toString()).toEqual(expectedInputAmount.quotient.toString());
            expect(inputAmount.equalTo(expectedInputAmount)).toBe(true);
        });
    });
});