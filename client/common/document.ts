import { h, VNode, init, classModule, attributesModule, propsModule, eventListenersModule, styleModule } from 'snabbdom';

export const patch = init([classModule, attributesModule, propsModule, eventListenersModule, styleModule]);

export function downloadPgnText(filename: string) {
    const text = (document.getElementById('pgntext') as HTMLInputElement).innerHTML;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

export function getDocumentData(name: string) {
    const elm = document.getElementById('pychess-variants');
    if (elm) {
        return elm.getAttribute('data-' + name.toLowerCase());
    } else {
        return "";
    }
}

export function debounce(callback: any, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => callback.apply(context, args), wait);
    };
}

export function getCookie(name: string) {
    const cookies = document.cookie.split(';');
    for(let i = 0; i < cookies.length; i++) {
        const pair = cookies[i].trim().split('=');
        if(pair[0] === name)
            return pair[1];
    }
    return "";
}

export function setCookie(cname: string, cvalue: string, exdays: number) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function changeCSS(cssLinkIndex: number, cssFile: string) {
    document.getElementsByTagName("link").item(cssLinkIndex)!.setAttribute("href", cssFile);
}

// css file index in templates/base.html
const BOARD_CSS_IDX = 1;
const PIECE_CSS_IDX = 2;

export function changeBoardCSS(assetUrl: string, family: string, cssFile: string) {
    const sheet = document.styleSheets[BOARD_CSS_IDX];
    const cssRules = sheet.cssRules;
    for (let i = 0; i < cssRules.length; i++) {
        const rule = cssRules[i];
        if (!( rule instanceof CSSStyleRule)) {
            continue;
        }
        if (rule.selectorText === `.${family} cg-board`) {
            // console.log("changeBoardCSS", family, cssFile, i)
            sheet.deleteRule(i)
            const newRule = `.${family} cg-board {background-image: url(${assetUrl}/images/board/${cssFile})}`;
            // console.log(newRule);
            sheet.insertRule(newRule, i);
            break;
        }
    }
}

export function changePieceCSS(assetUrl: string, family: string, cssFile: string) {
    let cssLinkIndex = PIECE_CSS_IDX;
    switch (family) {
        case "standard": break;
        case "seirawan": cssLinkIndex += 1; break;
        case "makruk": cssLinkIndex += 2; break;
        case "sittuyin": cssLinkIndex += 3; break;
        case "asean": cssLinkIndex += 4; break;
        case "shogi": cssLinkIndex += 5; break;
        case "kyoto": cssLinkIndex += 6; break;
        case "tori": cssLinkIndex += 7; break;
        case "xiangqi": cssLinkIndex += 8; break;
        case "capa": cssLinkIndex += 9; break;
        case "shako": cssLinkIndex += 10; break;
        case "shogun": cssLinkIndex += 11; break;
        case "janggi": cssLinkIndex += 12; break;
        case "orda": cssLinkIndex += 13; break;
        case "synochess": cssLinkIndex += 14; break;
        case "hoppel": cssLinkIndex += 15; break;
        case "dobutsu": cssLinkIndex += 16; break;
        case "shinobi": cssLinkIndex += 17; break;
        case "empire": cssLinkIndex += 18; break;
        case "ordamirror": cssLinkIndex += 19; break;
        case "chak": cssLinkIndex += 20; break;
        case "chennis": cssLinkIndex += 21; break;
        default: throw "Unknown piece family " + family;
    }
    const newUrl = `${assetUrl}/piece/${family}/${cssFile}.css`;
    // console.log("changePieceCSS", family, cssFile, newUrl)
    changeCSS(cssLinkIndex, newUrl);
}

export function bind(eventName: string, f: (e: Event) => void, redraw: null | (() => void)) {
    return {
        insert(vnode: VNode) {
            vnode.elm?.addEventListener(eventName, (e: Event) => {
                const res = f(e);
                if (redraw) redraw();
                return res;
            });
        }
    };
}

export function timeControlStr(minutes: number | string, increment = 0, byoyomiPeriod = 0): string {
    minutes = Number(minutes);
    byoyomiPeriod = Number(byoyomiPeriod)
    switch (minutes) {
        case 1 / 4:
            minutes = "¼";
            break;
        case 1 / 2:
            minutes = "½";
            break;
        case 3 / 4:
            minutes = "¾"
            break;
        default:
            minutes = String(minutes);
    }
    switch (byoyomiPeriod) {
        case 0 : return `${minutes}+${increment}`;
        case 1 : return `${minutes}+${increment}(b)`;
        default: return `${minutes}+${byoyomiPeriod}×${increment}(b)`;
    }
}

export function spinner(): VNode {
    return h('div#loader', [
        h('svg', { attrs: { viewBox: '0 0 67.81 57.08' } }, [
            h('g', [ 
                h('path.spinner', { attrs: { d: 'M7,13a.73.73,0,0,0,.87.23,14.2,14.2,0,0,0,2.67-1.45,2.39,2.39,0,0,0,1.06-1.37c.16-1.5-1.84-1.34-1-2s2.33-1.5,2.66,0-.85,4-3.08,5.2c0,0-3.89,2.3-5.54,3.59a14.48,14.48,0,0,0-3.29,15c2.91,8.25,8.41,10.46,10.54,11.21S5.81,53.89,5.2,54.77c-.42.6-.31.75,0,1.17s1.17,1,1.69.41,10.44-6,12.44-10,4-8,5.79-8.08,2.79,1.08,1.87,3a15.46,15.46,0,0,1-3,4.54c-.75.59,2.15,1.71,3.31.34s5-6.59,6.15-10.75,1.79-5.3,1.25-8.71-1.23-5.67-.88-7.46,5.88-8.92,7.67-9.88-4.66,6.84-5.25,9.13-.5,4,.17,7.12.17,6.21-1.46,10.21-3.71,7-3,9.29,2.71,3.42,3.67,3.34,9.33-.84,12.17-2,15.42-6.76,18.75-15.25S59.81,11.24,57,8.81C53.83,6,42.37-3.06,32.16,2S17.26,19.93,16.7,22s-2,5.23-3.79,5.42c-2,.21-3.75-.67-4.29-1.8a3.47,3.47,0,0,1,1-4.5C11.53,19.81,16,16.77,17.28,15s3.21-4.08,1.79-8.5-6.75-3.88-6.75-3.88S7.18,3.12,6,5.27a4.59,4.59,0,0,0-.42,4.5A13.74,13.74,0,0,0,7,13Z' } }),
                h('circle.spinner', { attrs: { cx: '25.03', cy: '23', r: '3.07' } }),
            ]),
        ]),
    ]);
}
