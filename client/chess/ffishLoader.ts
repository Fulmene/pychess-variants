import ffishFactory from 'ffish-es6';
const ffish = await ffishFactory({ 'locateFile': file => '/static/' + file });
const variantsIniFile = await fetch('variants.ini');
const variantsIni = await variantsIniFile.text();
ffish.loadVariantConfig(variantsIni);
export { ffish, variantsIni };
