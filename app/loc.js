/**
 * the default language to use
 * 
 * @var {string}
 * @author svartoyg
 */
var _languageDefault = null;


/**
 * the fallback language to use
 * 
 * @var {string}
 * @author svartoyg
 */
var _languageFallback = null;


/**
 * two level map with ISO-639-1 code as first key and translation id as second key
 * 
 * @var {Map<string,Map<string,string>>}
 * @author svartoyg
 */
var _data = {};


/**
 * @param {string} language
 * @return Promise<Map<string,string>>
 * @author svartoyg
 */
async function retrieveData (language) {
  try {
    return (await import(`../loc/${language}.json`)).default
  } catch (exception) {
    return (await import(`../loc/${language.substr(0, language.indexOf('-'))}.json`)).default
  }
}


/**
 * @param {string} languageDefault
 * @param {string} [languageFallback]
 * @author svartoyg
 */
export async function initialize (languageDefault, languageFallback = 'en') {
  _languageFallback = languageFallback;
  _languageDefault = languageDefault;
  for (const language of [_languageFallback, _languageDefault]) {
    if (_data.hasOwnProperty(language)) continue;
    console.log('--', 'loading localization data for language "' + language + '" ...');
    let data;
    try {
      data = await retrieveData(language);
    } catch (exception) {
      console.warn(exception.toString());
    }
    _data[language] = data;
  }
}


/**
 * gets a translation by its key for a specific language
 * 
 * @param {string} key
 * @param {string} [languageChosen]
 * @return {string}
 * @author svartoyg
 */
export function translate (key, languageChosen = _languageDefault) {
  let result = undefined;
  for (const language of [languageChosen, _languageFallback]) {
    if (_data.hasOwnProperty(language) && (_data[language] !== undefined) && _data[language].hasOwnProperty(key)) {
      result = _data[language][key];
      break;
    }
  }
  if (result === undefined) {
    result = ('{{' + key + '}}');
  }
  return result;
}

