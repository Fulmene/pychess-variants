import { Notation as cgNotation } from 'chessgroundx/types';
import { FairyStockfish, Notation as ffishNotation } from 'ffish-es6';

export function notation2ffishjs(n: cgNotation, ffish: FairyStockfish): ffishNotation {
    switch (n) {
        case cgNotation.ALGEBRAIC: return ffish.Notation.SAN;
        case cgNotation.SHOGI_ARBNUM: return ffish.Notation.SHOGI_HODGES_NUMBER;
        case cgNotation.JANGGI: return ffish.Notation.JANGGI;
        case cgNotation.XIANGQI_ARBNUM: return ffish.Notation.XIANGQI_WXF;
        default: return ffish.Notation.SAN;
    }
}
