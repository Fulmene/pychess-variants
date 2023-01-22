import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';

import { FairyStockfish, Board, Notation } from 'ffish-es6';

import { PyChessModel } from '@/common/pychess-variants';
import { boardSettings, BoardController } from '@/board/boardSettings';
import { CGMove, uci2cg } from '@/chess/chess';
import { Variant, VARIANTS, notation, moddedVariant } from '@/chess/variants';
import { ffishLoad, variantsIni } from '@/ffish/ffishLoader';
import { notation2ffishjs } from '@/chess/notation';

export abstract class ChessgroundController implements BoardController {
    readonly home: string;

    chessground: Api;

    ffish: FairyStockfish;
    ffishBoard: Board;
    notationAsObject: Notation;
    variantsIni: string;

    readonly variant : Variant;
    readonly chess960 : boolean;
    readonly hasPockets: boolean;
    readonly anon: boolean;
    mycolor: cg.Color;
    oppcolor: cg.Color;

    fullfen: string;
    notation: cg.Notation;

    constructor(el: HTMLElement, model: PyChessModel) {
        this.home = model.home;

        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.hasPockets = !!this.variant.pocket;
        this.anon = model.anon === 'True';
        this.mycolor = 'white';
        this.oppcolor = 'black';
        this.fullfen = model.fen as string;
        this.notation = notation(this.variant);

        const pocket0 = document.getElementById('pocket0') as HTMLElement;
        const pocket1 = document.getElementById('pocket1') as HTMLElement;

        const parts = this.fullfen.split(" ");
        const fen_placement: cg.FEN = parts[0];

        this.chessground = Chessground(el, {
            fen: fen_placement as cg.FEN,
            dimensions: this.variant.board.dimensions,
            notation: this.notation,
            addDimensionsCssVarsTo: document.body,
            kingRoles: this.variant.kingRoles,
            pocketRoles: this.variant.pocket?.roles,
        }, pocket0, pocket1);

        boardSettings.ctrl = this;
        boardSettings.assetURL = model.assetURL;
        const boardFamily = this.variant.boardFamily;
        const pieceFamily = this.variant.pieceFamily;
        boardSettings.update("BoardStyle", boardFamily);
        boardSettings.update("PieceStyle", pieceFamily);
        boardSettings.update("Zoom", boardFamily);
        boardSettings.update("blindfold");

        variantsIni().then(str => this.variantsIni = str);

        ffishLoad().then(ffish => {
            this.ffish = ffish;
            this.notationAsObject = notation2ffishjs(this.notation, ffish);
            this.ffishBoard = new this.ffish.Board(
                moddedVariant(this.variant.name, this.chess960, this.chessground.state.boardState.pieces, parts[2]),
                this.fullfen,
                this.chess960);
            window.addEventListener('beforeunload', () => this.ffishBoard.delete());
        });
    }

    toggleOrientation(): void {
        this.chessground.toggleOrientation();
    }

    flipped(): boolean {
        return this.chessground.state.orientation === 'black';
    }

    legalMoves(): CGMove[] {
        return this.ffishBoard.legalMoves().split(" ").map(uci2cg) as CGMove[];
    }
}
