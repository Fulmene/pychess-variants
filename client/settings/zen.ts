import { h, VNode } from 'snabbdom';

import { _ } from '@/common/i18n';
import { StringSettings } from './settings';
import { radioList } from './view';
import { patch } from '@/common/document';

const zenModeOptions = {
    off: _("Off"),
    on: _("On"),
};

class ZenModeSettings extends StringSettings {

    constructor() {
        super('zen', 'off');
    }

    update(): void {
        document.documentElement.setAttribute('data-zen', this.value);
    }

    view(): VNode {
        return h('div#zen-selector', radioList(this, 'zen', zenModeOptions, (_, key) => this.value = key));
    }

}

export const zenModeSettings = new ZenModeSettings();

function deactivateZenMode() {
    zenModeSettings.value = 'off';
    zenModeSettings.update();

    const el = document.getElementById('zen-selector') as HTMLElement;
    el.innerHTML = "";
    patch(el, zenModeSettings.view());
}

export function zenButtonView() {
    return h('a#zen-button', { on: { click: deactivateZenMode } }, [
        h('div.icon.icon-check', _('ZEN MODE'))
    ]);
}
