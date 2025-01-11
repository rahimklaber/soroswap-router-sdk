import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { BASIS_POINTS, Networks, ONE, ZERO, _1000, _997 } from "../constants";
import { CurrencyAmount, Price } from "./fractions";
import { Token } from "./token";
import _ from "lodash";
import { _1e11, _1e7, BONE, cPow, createFeeAdjustRatio, divCeil, scalar } from "./comet";

// see https://stackoverflow.com/a/41102306
const CAN_SET_PROTOTYPE = "setPrototypeOf" in Object;

/**
 * Indicates that the pair has insufficient reserves for a desired output amount. I.e. the amount of output cannot be
 * obtained by sending any amount of input.
 */
export class InsufficientReservesError extends Error {
  public readonly isInsufficientReservesError: true = true;

  public constructor() {
    super();
    this.name = this.constructor.name;
    if (CAN_SET_PROTOTYPE) Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Indicates that the input amount is too small to produce any amount of output. I.e. the amount of input sent is less
 * than the price of a single unit of output after fees.
 */
export class InsufficientInputAmountError extends Error {
  public readonly isInsufficientInputAmountError: true = true;

  public constructor() {
    super();
    this.name = this.constructor.name;
    if (CAN_SET_PROTOTYPE) Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface CometOpts {
  weightA: JSBI,
  weightB: JSBI,
}

export class Pair {
  public readonly liquidityToken: Token;
  private fee: number;
  private readonly tokenAmounts: [CurrencyAmount<Token>, CurrencyAmount<Token>];
  private readonly cometOpts: CometOpts | null = null;

  public static getAddress(tokenA: Token, tokenB: Token): string {
    return `${tokenA} - ${tokenB} pair`;
  }

  public constructor(
    currencyAmountA: CurrencyAmount<Token>,
    tokenAmountB: CurrencyAmount<Token>,
    fee: number = 30,
    cometOpts: CometOpts | null = null, 
  ) {
    const tokenAmounts = currencyAmountA.currency.sortsBefore(
      tokenAmountB.currency
    ) // does safety checks
      ? [currencyAmountA, tokenAmountB]
      : [tokenAmountB, currencyAmountA];

    this.liquidityToken = new Token(
      tokenAmounts[0].currency.network,
      Pair.getAddress(tokenAmounts[0].currency, tokenAmounts[1].currency),
      18
    );

    this.tokenAmounts = tokenAmounts as [
      CurrencyAmount<Token>,
      CurrencyAmount<Token>
    ];
    this.fee = fee;
    if(cometOpts) {
      this.cometOpts = {...cometOpts}

      if(currencyAmountA.currency.equals(this.tokenAmounts[1].currency)) {
        this.cometOpts.weightA = cometOpts.weightB;
        this.cometOpts.weightB = cometOpts.weightA;
      }
    }
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token to check
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1);
  }

  /**
   * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
   */
  public get token0Price(): Price<Token, Token> {
    const result = this.tokenAmounts[1].divide(this.tokenAmounts[0]);
    return new Price(
      this.token0,
      this.token1,
      result.denominator,
      result.numerator
    );
  }

  /**
   * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
   */
  public get token1Price(): Price<Token, Token> {
    const result = this.tokenAmounts[0].divide(this.tokenAmounts[1]);
    return new Price(
      this.token1,
      this.token0,
      result.denominator,
      result.numerator
    );
  }

  /**
   * Return the price of the given token in terms of the other token in the pair.
   * @param token token to return price of
   */
  public priceOf(token: Token): Price<Token, Token> {
    invariant(this.involvesToken(token), "TOKEN");
    return token.equals(this.token0) ? this.token0Price : this.token1Price;
  }

  /**
   * Returns the chain ID of the tokens in the pair.
   */
  public get network(): Networks {
    return this.token0.network;
  }

  public get token0(): Token {
    return this.tokenAmounts[0].currency;
  }

  public get token1(): Token {
    return this.tokenAmounts[1].currency;
  }

  public get reserve0(): CurrencyAmount<Token> {
    return this.tokenAmounts[0];
  }

  public get reserve1(): CurrencyAmount<Token> {
    return this.tokenAmounts[1];
  }

  public reserveOf(token: Token): CurrencyAmount<Token> {
    return token.equals(this.token0) ? this.reserve0 : this.reserve1;
  }

  public getOutputAmount(
    inputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(inputAmount.currency), "TOKEN");
    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO)
    ) {
      throw new InsufficientReservesError();
    }

    const inputReserve = this.reserveOf(inputAmount.currency);

    const outputReserve = this.reserveOf(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0
    );

    const inputAmountWithFeeAndAfterTax = JSBI.multiply(
      inputAmount.quotient,
      _997
    );

    const numerator = JSBI.multiply(
      inputAmountWithFeeAndAfterTax,
      outputReserve.quotient
    );

    const denominator = JSBI.add(
      JSBI.multiply(inputReserve.quotient, _1000),
      inputAmountWithFeeAndAfterTax
    );

    const outputAmount = CurrencyAmount.fromRawAmount(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI.divide(numerator, denominator) // JSBI.divide will round down by itself, which is desired
    );
    if (JSBI.greaterThan(outputAmount.quotient, outputReserve.quotient)) {
      throw new InsufficientReservesError();
    }

    if (JSBI.equal(outputAmount.quotient, ZERO)) {
      throw new InsufficientInputAmountError();
    }

    return [
      outputAmount,
      new Pair(
        inputReserve.add(inputAmount),
        outputReserve.subtract(outputAmount)
      ),
    ];
  }

  public getOutputAmountSoroswap(
    inputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    return this.getOutputAmount(inputAmount);
  }

  public getOutputAmountPhoenix(
    inputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(inputAmount.currency), "TOKEN");
    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO)
    ) {
      throw new InsufficientReservesError();
    }
    const inputReserve = this.reserveOf(inputAmount.currency);
    const outputReserve = this.reserveOf(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0
    );

    // This is how it is calculated inside the contract
    // However we encounter a loss of precision when using JSBI
    // So we choose to use the formula below
    //
    // const crossProduct = JSBI.multiply(
    //   inputReserve.quotient,
    //   outputReserve.quotient
    // );
    // 
    // const outputAmountBeforeTax = JSBI.subtract(
    //   outputReserve.quotient,
    //   JSBI.divide(
    //     crossProduct,
    //     JSBI.add(inputReserve.quotient, inputAmount.quotient)
    //   )
    // );

    const outputAmountBeforeTax = JSBI.divide(
      JSBI.multiply(outputReserve.quotient, inputAmount.quotient),
      JSBI.add(inputReserve.quotient, inputAmount.quotient)
    );
    const taxAmount = JSBI.divide(
      JSBI.multiply(outputAmountBeforeTax, JSBI.BigInt(this.fee)),
      BASIS_POINTS
    );
    const outputAmount = CurrencyAmount.fromRawAmount(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI.subtract(outputAmountBeforeTax, taxAmount)
    );

    // TODO: returnamount should be before tax
    return [
      outputAmount,
      new Pair(
        inputReserve.add(inputAmount),
        outputReserve.subtract(CurrencyAmount.fromRawAmount(
          outputAmount.currency,
          outputAmount.quotient)
        )
      )
    ]
  }

  public getOutputAmountAquarius(
    inputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(inputAmount.currency), "TOKEN");
    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO)
    ) {
      throw new InsufficientReservesError();
    }
    const inputReserve = this.reserveOf(inputAmount.currency);

    const outputReserve = this.reserveOf(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0
    );

    const numerator = JSBI.multiply(
      inputAmount.quotient,
      outputReserve.quotient
    );

    const denominator = JSBI.add(
      inputReserve.quotient,
      inputAmount.quotient
    );
    const outputAmountBeforeTax = JSBI.divide(numerator, denominator);

    const taxAmount = JSBI.divide(JSBI.multiply(outputAmountBeforeTax, JSBI.BigInt(this.fee)), BASIS_POINTS);

    const outputAmount = CurrencyAmount.fromRawAmount(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI.subtract(outputAmountBeforeTax, taxAmount)
    );

    if (JSBI.greaterThan(outputAmount.quotient, outputReserve.quotient)) {
      throw new InsufficientReservesError();
    }

    if (JSBI.equal(outputAmount.quotient, ZERO)) {
      throw new InsufficientInputAmountError();
    }
    // TODO: returnamount should be before tax

    return [
      outputAmount,
      new Pair(
        inputReserve.add(inputAmount),
        outputReserve.subtract(CurrencyAmount.fromRawAmount(
          outputAmount.currency,
          outputAmountBeforeTax)
        )
      )
    ]
  }

  
  private otherToken(token: Token): Token {
    return token.equals(this.token0) ? this.token1 : this.token0;
  }


  private scaledReserve(token: Token): JSBI {
      return JSBI.multiply(this.reserveOf(token).quotient, scalar);
  }

  private weightOf(token: Token): JSBI{
    if(this.token0.equals(token)) {
      return this.cometOpts!.weightA;
    }else {
      return this.cometOpts!.weightB;
    }
  }

  private weightRatioOf(token: Token): JSBI{
    return JSBI.divide(JSBI.multiply(this.weightOf(token), BONE), this.weightOf(this.otherToken(token)));
  }

  public getOutputAmountComet(
    inputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(inputAmount.currency), "TOKEN");
    if (this.cometOpts === null) {
      throw new Error("CometOpts is null");
    }

    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO)
    ) {
      throw new InsufficientReservesError();
    }

    const tokenBalanceIn = this.scaledReserve(inputAmount.currency);
    const tokenBalanceOut = this.scaledReserve(this.otherToken(inputAmount.currency));
    const tokenAmountIn = JSBI.multiply(inputAmount.quotient, scalar);

    const feeAdjustRatio = createFeeAdjustRatio(this.fee);

    const adjustedIn = JSBI.divide(JSBI.multiply(tokenAmountIn, feeAdjustRatio), BONE);

    const weightRatio = this.weightRatioOf(inputAmount.currency);

    const base = JSBI.divide(JSBI.multiply(tokenBalanceIn, BONE), JSBI.add(tokenBalanceIn, adjustedIn));
    const power = cPow(base, weightRatio);

    const balanceRatio = JSBI.subtract(BONE, power);

    const result = JSBI.divide(JSBI.multiply(tokenBalanceOut, balanceRatio), BONE);

    const amountOut = JSBI.divide(result, scalar);

    return [
      CurrencyAmount.fromRawAmount(this.otherToken(inputAmount.currency), amountOut),
      new Pair(
        this.reserveOf(inputAmount.currency).add(inputAmount),
        this.reserveOf(this.otherToken(inputAmount.currency)).subtract(
          CurrencyAmount.fromRawAmount(this.otherToken(inputAmount.currency), amountOut)
        ),
        this.fee,
        this.cometOpts
      )
    ]
  }

  public getInputAmountComet(
    outputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(outputAmount.currency), "TOKEN");
    if (this.cometOpts === null) {
      throw new Error("CometOpts is null");
    }

    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO) ||
      JSBI.greaterThanOrEqual(
        outputAmount.quotient,
        this.reserveOf(outputAmount.currency).quotient
      )
    ) {
      throw new InsufficientReservesError();
    }

    const tokenBalanceIn = this.scaledReserve(this.otherToken(outputAmount.currency));
    const tokenBalanceOut = this.scaledReserve(outputAmount.currency);
    const tokenAmountOut = JSBI.multiply(outputAmount.quotient, scalar);

    const feeAdjustRatio = createFeeAdjustRatio(this.fee);
    const weightRatio = this.weightRatioOf(outputAmount.currency);

    let base = divCeil(JSBI.multiply(tokenBalanceOut, BONE), JSBI.subtract(tokenBalanceOut, tokenAmountOut));
    const power = cPow(base, weightRatio, true);
    const balanceRatio = JSBI.subtract(power, BONE);

    const amountWithoutFeeIn = divCeil(JSBI.multiply(tokenBalanceIn, balanceRatio), BONE);
    const amountIn = divCeil(JSBI.divide(JSBI.multiply(amountWithoutFeeIn, BONE), feeAdjustRatio),scalar);

    return [
      CurrencyAmount.fromRawAmount(
        this.otherToken(outputAmount.currency),
        amountIn
      ), new Pair(
        this.reserveOf(outputAmount.currency).subtract(outputAmount),
        this.reserveOf(this.otherToken(outputAmount.currency)).add(
          CurrencyAmount.fromRawAmount(this.otherToken(outputAmount.currency), amountIn)
        ),
        this.fee,
        this.cometOpts
      ),
    ];
  }

  public getInputAmount(
    outputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(outputAmount.currency), "TOKEN");

    if (
      JSBI.equal(this.reserve0.quotient, ZERO) ||
      JSBI.equal(this.reserve1.quotient, ZERO) ||
      JSBI.greaterThanOrEqual(
        outputAmount.quotient,
        this.reserveOf(outputAmount.currency).quotient
      ) ||
      JSBI.greaterThanOrEqual(
        outputAmount.quotient,
        this.reserveOf(outputAmount.currency).quotient
      )
    ) {
      throw new InsufficientReservesError();
    }

    const outputReserve = this.reserveOf(outputAmount.currency);

    const inputReserve = this.reserveOf(
      outputAmount.currency.equals(this.token0) ? this.token1 : this.token0
    );

    const numerator = JSBI.multiply(
      JSBI.multiply(inputReserve.quotient, outputAmount.quotient),
      _1000
    );
    const denominator = JSBI.multiply(
      JSBI.subtract(outputReserve.quotient, outputAmount.quotient),
      _997
    );

    const inputAmount = CurrencyAmount.fromRawAmount(
      outputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI.add(JSBI.divide(numerator, denominator), ONE) // add 1 here is part of the formula, no rounding needed here, since there will not be decimal at this point
    );

    return [
      inputAmount,
      new Pair(
        inputReserve.add(inputAmount),
        outputReserve.subtract(outputAmount)
      ),
    ];
  }

  public getInputAmountSoroswap(
    outputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    return this.getInputAmount(outputAmount);
  }

  public getInputAmountPhoenix(
    outputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {
    invariant(this.involvesToken(outputAmount.currency), "TOKEN");
    const outputReserve = this.reserveOf(outputAmount.currency);
    const inputReserve = this.reserveOf(
      outputAmount.currency.equals(this.token0) ? this.token1 : this.token0
    );

    const numerator = JSBI.multiply(
      JSBI.multiply(inputReserve.quotient, outputAmount.quotient),
      BASIS_POINTS
    );
    const denominator =
      JSBI.subtract(
        JSBI.multiply(
          outputReserve.quotient,
          JSBI.subtract(BASIS_POINTS, JSBI.BigInt(this.fee))
        ),
        JSBI.multiply(
          outputAmount.quotient,
          BASIS_POINTS
        )
      );
    const inputAmount = CurrencyAmount.fromRawAmount(
      inputReserve.currency,
      JSBI.divide(numerator, denominator)
    );

    return [inputAmount,
      new Pair(
        inputReserve.add(inputAmount),
        outputReserve.subtract(outputAmount)
      )
    ]
  }

  public getInputAmountAquarius(
    outputAmount: CurrencyAmount<Token>
  ): [CurrencyAmount<Token>, Pair] {

    return this.getInputAmountPhoenix(outputAmount);
  }
}
