import { h } from "snabbdom";

import * as cg from 'chessgroundx/types';

import { letter2role } from './chess';
import { ChessgroundController } from './cgCtrl';

export type Position = 'top' | 'bottom';

export class PieceRow {
    ctrl: ChessgroundController;
    color: cg.Color;
    position: Position;

    constructor(ctrl: ChessgroundController, color: cg.Color, position: Position) {
        this.ctrl = ctrl;
        this.color = color;
        this.position = position;
    }

    view() {
        const variant = this.ctrl.variant;
        const roleLetters = variant.pieceRoles(this.color);
        return h(`div.pocket.${this.position}.editor.usable`, {
            class: { usable: true },
            style: {
                '--editorLength': String(roleLetters.length),
                '--piecerows': String((roleLetters.length > variant.boardWidth) ? 2 : 1),
                '--files': String(variant.boardWidth),
                '--ranks': String(variant.boardHeight),
            },
            on: {
                mousedown: (e: cg.MouchEvent) => this.ctrl.dragPocket(e),
                touchstart: (e: cg.MouchEvent) => this.ctrl.dragPocket(e),
            },
        }, roleLetters.map(r => {
            const promoted = r.length > 1;
            const role = letter2role(r);
            return h(`piece.${role}.${this.color}`, {
                attrs: {
                    'data-role': role,
                    'data-color': this.color,
                    'data-nb': -1,
                    'data-promoted': promoted ? 'true' : 'false',
                },
            });
        }));
    }
}
