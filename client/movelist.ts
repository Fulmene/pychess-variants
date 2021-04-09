import { init } from "snabbdom";
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

const patch = init([klass, attributes, properties, listeners]);

import h from 'snabbdom/h';
//import { VNode } from 'snabbdom/vnode';

import { _ } from './i18n';
import { GameController } from './gameCtrl';
import { result } from './profile'

export class MoveList {
    // TODO add variation functionality
    ctrl: GameController;
    activePly: number;

    constructor(ctrl: GameController) {
        this.ctrl = ctrl;
        this.activePly = 0;
    }

    selectPly(ply: number): void {
        this.activePly = ply;
        this.ctrl.goPly(ply);
        this.activatePly();
        this.scrollToActivePly();
    }

    activatePly() {
        const active = document.querySelector('move.active');
        if (active) active.classList.remove('active');
        const elPly = document.querySelector(`move[ply="${this.activePly}"]`);
        if (elPly) elPly.classList.add('active');
    }

    scrollToActivePly() {
        if (this.ctrl.steps.length < 9) return;
        const movelistEl = document.getElementById('movelist') as HTMLElement;
        const plyEl = movelistEl.querySelector('move.active') as HTMLElement | null;

        let st: number | undefined;

        if (this.activePly === 0) st = 0;
        else if (this.activePly === this.ctrl.steps.length - 1) st = 99999;
        else if (plyEl) st = plyEl.offsetTop - movelistEl.offsetHeight / 2 + plyEl.offsetHeight / 2;

        if (st !== undefined) movelistEl.scrollTop = st;
    }

    addResult() {
        if (this.ctrl.status < 0) return;

        const container = document.getElementById('movelist') as HTMLElement;
        this.ctrl.vmovelist = patch(container, h('div#movelist', h('div#result', result(this.ctrl.variant, this.ctrl.status, this.ctrl.result))));
        container.scrollTop = 99999;
    }

    moveControlView() {
        return h('div#btn-controls-top.btn-controls', [
            h('button#flip', { on: { click: () => this.ctrl.toggleOrientation() } }, h('i.icon.icon-refresh', { props: { title: _('Flip board') } })),
            h('button', { on: { click: () => this.selectPly(0) } }, h('i.icon.icon-fast-backward', { props: { title: _('Starting position') } })),
            // TODO
            h('button', { on: { click: () => this.selectPly(Math.max(0, this.activePly - 1)) } }, h('i.icon.icon-step-backward', { props: { title: _('Previous move') } })),
            h('button', { on: { click: () => this.selectPly(Math.min(0, this.activePly + 1)) } }, h('i.icon.icon-step-forward', { props: { title: _('Next move') } })),
            h('button', { on: { click: () => this.selectPly(this.ctrl.steps.length - 1) } }, h('i.icon.icon-fast-forward', { props: { title: _('Last move') } })),
        ]);
    }
}

/*
export function updateMovelist (ctrl, full = true, activate = true, needResult = true) {
    const plyFrom = (full) ? 1 : ctrl.steps.length -1
    const plyTo = ctrl.steps.length;

    const moves: VNode[] = [];
    for (let ply = plyFrom; ply < plyTo; ply++) {
        const move = ctrl.steps[ply]['san'];
        if (move === null) continue;

        const moveEl = [ h('san', move) ];
        const scoreStr = ctrl.steps[ply]['scoreStr'] ?? '';
        moveEl.push(h('eval#ply' + ply, scoreStr));

        if (ply % 2 !== 0)
            moves.push(h('move.counter', (ply + 1) / 2));

        const el = h('move', {
            class: { active: ((ply === plyTo - 1) && activate) },
            attrs: { ply: ply },
            on: { click: () => selectMove(ctrl, ply) },
        }, moveEl);

        moves.push(el);
        
        if (ctrl.steps[ply]['vari'] !== undefined) {
            const variMoves = ctrl.steps[ply]['vari'];

            if (ply % 2 !== 0) moves.push(h('move', '...'));

            moves.push(h('vari#vari' + ctrl.plyVari,
                variMoves.map((x, idx) => {
                    const currPly = ctrl.plyVari + idx;
                    const moveCounter = (currPly % 2 !== 0) ? (currPly + 1) / 2 + '. ' : (idx === 0) ? Math.floor((currPly + 1) / 2) + '...' : ' ';
                    return h('vari-move', {
                        attrs: { ply: currPly },
                        on: { click: () => selectMove(ctrl, idx, ctrl.plyVari) },
                        }, [ h('san', moveCounter + x['san']) ]
                    );
                })
            ));

            if (ply % 2 !== 0) {
                moves.push(h('move.counter', (ply + 1) / 2));
                moves.push(h('move', '...'));
            }
        }
    }

    if (ctrl.status >= 0 && needResult) {
        moves.push(h('div#result', result(ctrl.variant, ctrl.status, ctrl.result)));
    }

    if (full) {
        ctrl.vmovelist = patch(ctrl.vmovelist, h('div#movelist'));
        ctrl.vmovelist = patch(ctrl.vmovelist, h('div#movelist', moves));
    } else {
        const container = document.getElementById('movelist') as HTMLElement;
        ctrl.vmovelist = patch(container, h('div#movelist', moves));
    }

    if (activate)
        activatePly(ctrl);
        scrollToPly(ctrl);
}
*/
