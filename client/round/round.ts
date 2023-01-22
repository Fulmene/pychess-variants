import { h, VNode } from "snabbdom";

import { gameInfo } from '@/game/gameInfo';
import { renderTimeago } from '@/common/datetime';
import { VARIANTS } from '@/chess/variants';
import { RoundController } from './roundCtrl';
import { PyChessModel } from '@/common/pychess-variants';

function runGround(vnode: VNode, model: PyChessModel): void {
    const el = vnode.elm as HTMLElement;
    new RoundController(el, model);
}

export function roundView(model: PyChessModel): VNode[] {
    const variant = VARIANTS[model.variant];

    renderTimeago();

    return [
        h('aside.sidebar-first', [
            gameInfo(model),
            h('div#roundchat'),
        ]),
        h('div.round-app', [
            h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div.cg-wrap.' + variant.board.cg, {
                    hook: {
                        insert: (vnode) => runGround(vnode, model)
                    },
                }),
            ]),
            h('div.material.material-top.' + variant.pieceFamily + '.disabled'),
            h('div.pocket-top', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div.info-wrap0', [
                h('div.clock-wrap', [
                    h('div#clock0'),
                    h('div#more-time'),
                    h('div#berserk0'),
                ]),
                h('div#misc-info0'),
            ]),
            h('div#expiration-top'),
            h('round-player0#rplayer0'),
            h('div#move-controls'),
            h('div.movelist-block', [
                h('div#movelist'),
            ]),
            h('div#offer-dialog'),
            h('div#game-controls'),
            h('round-player1#rplayer1'),
            h('div#expiration-bottom'),
            h('div.info-wrap1', [
                h('div.clock-wrap', [
                    h('div#clock1'),
                    h('div#berserk1'),
                ]),
                h('div#misc-info1'),
            ]),
            h('div.pocket-bot', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('div.material.material-bottom.' + variant.pieceFamily + '.disabled'),
        ]),
        h('under-left#spectators'),
        h('under-board', [
            h('div#janggi-setup-buttons'),
            h('div.ctable-container'),
        ]),
    ];
}
