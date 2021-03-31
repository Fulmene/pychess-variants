import { h } from "snabbdom";
import { VNode } from 'snabbdom/vnode';

import * as cg from 'chessgroundx/types';

import { IVariant, letter2role } from './chess';

export type Position = 'top' | 'bottom';

export class PieceRow {
    variant: IVariant;
    color: cg.Color;
    position: Position;
    protected insertHook: (vnode: VNode) => void;

    constructor(variant: IVariant, color: cg.Color, position: Position, insertHook: (vnode: VNode) => void) {
        this.variant = variant;
        this.color = color;
        this.position = position;
        this.insertHook = insertHook;
    }

    view() {
        const roleLetters = this.variant.pieceRoles(this.color);
        return h(`div.pocket.${this.position}.editor.usable`, {
            class: { usable: true },
            style: {
                '--editorLength': String(roleLetters.length),
                '--piecerows': String((roleLetters.length > this.variant.boardWidth) ? 2 : 1),
                '--files': String(this.variant.boardWidth),
                '--ranks': String(this.variant.boardHeight),
            },
            hook: { insert: this.insertHook },
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
