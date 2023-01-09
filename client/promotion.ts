import { h, toVNode } from 'snabbdom';

import * as util from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';
import { Api } from "chessgroundx/api";

import { UCIMove, PromotionSuffix, promotedRole, unpromotedRole, promotionSuffix } from './chess';
import { patch, bind } from './document';
import { GameController } from './gameCtrl';

type PromotionChoices = Partial<Record<cg.Role, PromotionSuffix>>;

export class Promotion {
    ctrl: GameController;
    promoting?: { orig: cg.Orig, dest: cg.Key };
    choices: PromotionChoices;

    constructor(ctrl: GameController) {
        this.ctrl = ctrl;
        this.choices = {};
    }

    start(piece: cg.Piece, orig: cg.Orig, dest: cg.Key, disableAutoPromote: boolean = false) {
        const ground = this.ctrl.chessground;
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.boardState.pieces.get(dest) === undefined) return false;

        const choices = this.promotionChoices(piece, orig, dest);
        const autoSuffix = this.ctrl.variant.promotion.order[0];
        const autoRole = this.ctrl.variant.promotion.type === "shogi" ? undefined : util.roleOf(autoSuffix as cg.Letter);
        if (this.ctrl.variant.promotion.autoPromoteable &&
            this.ctrl.autoPromote &&
            !disableAutoPromote &&
            autoRole &&
            autoRole in choices)
            this.choices = { [autoRole]: autoSuffix };
        else
            this.choices = choices;

        console.log(choices);

        const color = piece.color;
        const orientation = ground.state.orientation;
        if (Object.keys(this.choices).length === 1) {
            const role = Object.keys(this.choices)[0] as cg.Role;
            if (role === piece.role) return false;
            const promo = this.choices[role];
            this.promote(ground, dest, role);
            this.ctrl.sendMove(orig, dest, promo!);
        } else {
            this.drawPromo(dest, color, orientation);
            this.promoting = {
                orig: orig,
                dest: dest,
            };
        }
        return true;
    }

    private promotionChoices(piece: cg.Piece, orig: cg.Orig, dest: cg.Key): PromotionChoices {
        const variant = this.ctrl.variant;
        const possiblePromotions = (this.ctrl.ffishBoard.legalMoves().split(" ") as UCIMove[]).filter(move => move.includes(orig + dest));
        console.log(possiblePromotions);
        const choices: PromotionChoices = {};

        possiblePromotions.map(promotionSuffix).forEach(suffix => {
            let role: cg.Role;
            if (suffix === '+') role = promotedRole(variant, piece);
            else if (suffix === '-') role = unpromotedRole(variant, piece);
            else if (suffix === '') role = piece.role;
            else role = util.roleOf(suffix);
            choices[role] = suffix;
        });

        return choices;
    }

    private promote(g: Api, key: cg.Key, role: cg.Role) {
        const piece = g.state.boardState.pieces.get(key);
        if (piece && piece.role !== role) {
            g.setPieces(new Map([[key, {
                color: piece.color,
                role: role,
                promoted: true
            }]]));
        }
    }

    private drawPromo(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(dest, color, orientation));
    }

    private drawNoPromo() {
        const container = document.getElementById('extension_choice') as HTMLElement;
        patch(container, h('extension'));
    }

    private finish(role: cg.Role) {
        if (this.promoting) {
            this.drawNoPromo();
            this.promote(this.ctrl.chessground, this.promoting.dest, role);
            const promo = this.choices[role];

            if (util.isDropOrig(this.promoting.orig))
                this.ctrl.sendMove(util.dropOrigOf(role), this.promoting.dest, "");
            else
                this.ctrl.sendMove(this.promoting.orig, this.promoting.dest, promo!);

            this.promoting = undefined;
        }
    }

    private cancel() {
        this.drawNoPromo();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private view(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const variant = this.ctrl.variant;
        const width = variant.board.dimensions.width;
        const height = variant.board.dimensions.height;
        const pos = util.key2pos(dest);

        const choices = Object.keys(this.choices) as cg.Role[];
        choices.sort((a, b) => variant.promotion.order.indexOf(this.choices[a]!) - variant.promotion.order.indexOf(this.choices[b]!));

        const direction = color === orientation ? "bottom" : "top";
        const leftFile = (orientation === "white") ? pos[0] : width - 1 - pos[0];
        const left = leftFile * (100 / width);
        const topRank = (orientation === "white") ? height - 1 - pos[1] : pos[1];

        const side = color === orientation ? "ally" : "enemy";

        return h("div#extension_choice", {
            hook: {
                insert: vnode => {
                    const el = vnode.elm as HTMLElement;
                    el.addEventListener("click", () => this.cancel());
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        },
            choices.map((role, i) => {
                const rank = topRank + (direction === "bottom" ? i : -i);
                const top = rank * (100 / height);
                return h("square", {
                    style: { top: top + "%", left: left + "%" },
                    hook: bind("click", e => {
                        e.stopPropagation();
                        this.finish(role as cg.Role);
                    }, null)
                },
                    [ h(`piece.${role}.${color}.${side}`) ]
                );
            })
        );
    }

}
