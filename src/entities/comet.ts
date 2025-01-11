import JSBI from "jsbi";
import { ONE, ZERO } from "../constants";

export const BONE = JSBI.BigInt(1e18);
export const _1e7 = JSBI.BigInt(1e7);
export const _1e11 = JSBI.BigInt(1e11);
export const scalar = JSBI.BigInt(1e7);

export const createFeeAdjustRatio = (fee: number)=> JSBI.multiply(JSBI.subtract(_1e7, JSBI.BigInt(fee * 1000)), _1e11);


const cPowI = (_a: JSBI, _n: number) => {
  let z = BONE;

  if (_n % 2 !== 0) {
    z = _a;
  }


  let n = Math.floor(_n / 2);
  let a = _a;

  while (n !== 0) {
    a = JSBI.divide(JSBI.multiply(a, a), BONE);

    if (n % 2 !== 0) {
      z = JSBI.divide(JSBI.multiply(z, a), BONE);
    }

    n = Math.floor(n / 2);
  }

  return z;
};

const cPowApprox = (base: JSBI, exp: JSBI, roundUp: boolean) => {
  const precision = JSBI.BigInt(1e8);

  let term = BONE;
  let sum = term;

  let x = JSBI.subtract(base, BONE);

  for (let i = 1; i <= 50; i++) {
    let bigK = JSBI.multiply(BONE, JSBI.BigInt(i));
    let c = JSBI.subtract(exp, JSBI.subtract(bigK, BONE));

    term = JSBI.divide(
      JSBI.multiply(term, JSBI.divide(JSBI.multiply(x, c), BONE)),
      BONE
    );
    term = JSBI.divide(JSBI.multiply(term, BONE), bigK);
    sum = JSBI.add(sum, term);

    let absTerm = JSBI.lessThan(term, ZERO) ? JSBI.unaryMinus(term) : term;

    if (JSBI.lessThanOrEqual(absTerm, precision)) {
      break;
    }
  }

  if (JSBI.greaterThan(x, ZERO)) {

    if (JSBI.greaterThan(term, ZERO) && !roundUp) {

        sum = JSBI.subtract(sum, term);
    }else if (JSBI.lessThan(term, ZERO) && roundUp) {

        sum = JSBI.subtract(sum, term);
    }

  }else if (!roundUp) {

    sum = JSBI.add(sum, term);

  }


  return sum;
};

export const cPow = (base: JSBI, exp: JSBI, roundUp: boolean = false) => {
  const int = JSBI.divide(exp, BONE);
  const remain = JSBI.subtract(exp, JSBI.multiply(int, BONE));

  let wholePow = cPowI(base, JSBI.toNumber(int));
  if (JSBI.equal(remain, ZERO)) {
    return wholePow;
  }

  let partialResult = cPowApprox(base, remain, roundUp);

  if (roundUp) {

    let t = JSBI.multiply(wholePow, partialResult);
    
    let result =  JSBI.divide(t, BONE);
    const remainder = JSBI.remainder(t, BONE);

    if (JSBI.greaterThan(remainder, ZERO)) {
      result = JSBI.add(result, ONE);
    }

    return result;
  }

  return JSBI.divide(JSBI.multiply(wholePow, partialResult), BONE);
};

export const divCeil = (a: JSBI, b: JSBI): JSBI => {
    let result = JSBI.divide(a, b);
    let remainder = JSBI.remainder(a, b);

    if(remainder !== ZERO) {
      result = JSBI.add(result, ONE);
    }

    return result;
};
