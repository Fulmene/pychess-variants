import { h, VNode } from 'snabbdom';

import { _ } from '@/common/i18n';
import { PyChessModel } from "@/common/pychess-variants";
import { selectVariant, VARIANTS } from '@/chess/variants';
import { EditorController } from './editorCtrl';

function runEditor(vnode: VNode, model: PyChessModel) {
    const el = vnode.elm as HTMLElement;
    new EditorController(el, model);
}

function setVariant() {
    const e = document.getElementById('variant') as HTMLSelectElement;
    const variant = e.options[e.selectedIndex].value;
    window.location.assign('/editor/' + variant);
}

export function editorView(model: PyChessModel): VNode[] {
    const vVariant = model.variant || "chess";
    const variant = VARIANTS[vVariant];

    return [
        h('div.editor-app', [
            h('aside.sidebar-first', [
                h('div.container', [
                    h('div', [
                        h('label', { attrs: { for: "variant" } }, _("Variant")),
                        selectVariant("variant", vVariant, setVariant, () => {}),
                    ]),
                ])
            ]),

            h('div.pocket-wrapper.top', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces0'),
                    ]),
                ]),
            ]),
            h(`selection#mainboard.${variant.boardFamily}.${variant.pieceFamily}.${variant.ui.boardMark}`, [
                h('div.cg-wrap.' + variant.board.cg,
                    { hook: { insert: (vnode) => runEditor(vnode, model)},
                }),
            ]),
            h('div.pocket-wrapper.bot', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pieces1'),
                    ]),
                ]),
            ]),

            h('div.pocket-top', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket0'),
                    ]),
                ]),
            ]),
            h('div#editor-button-container'),
            h('div.pocket-bot', [
                h('div.' + variant.pieceFamily + '.' + model["variant"], [
                    h('div.cg-wrap.pocket', [
                        h('div#pocket1'),
                    ]),
                ]),
            ]),
            h('under-board', [
                h('input#fen'),
            ]),
        ]),
    ];
}
