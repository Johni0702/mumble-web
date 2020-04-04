import {CacheLocalstorage} from './cache';
import {read as fileRead} from './file';
// import {Util} from 'util';


/**
 * the relative path to the directory containing the JSON localization files
 * 
 * @var {string}
 * @author fenris
 */
var _directory = 'loc';


/**
 * the default language to use
 * 
 * @var {string}
 * @author fenris
 */
var _languageDefault = null;


/**
 * the fallback language to use
 * 
 * @var {string}
 * @author fenris
 */
var _languageFallback = null;


/**
 * @var {Cache}
 * @author fenris
 */
var _cache = null;


/**
 * two level map with ISO-639-1 code as first key and translation id as second key
 * 
 * @var {Map<string,Map<string,string>>}
 * @author fenris
 */
var _data = {};


/**
 * @param {string} language
 * @return Promise<Map<string,string>>
 * @author fenris
 */
async function retrieveData (language) {
  const regexp = (new RegExp("^([a-z]{2})$"));
  if (regexp.exec(language) === null) {
    return Promise.reject(new Error('invalid language code "' + language + '"'));
  } else {
    const path = (_directory + '/' + language + '.json');
    let content;
    try {
      content = await fileRead(path);
    } catch (exception) {
      return Promise.reject(new Error('could not load localization data for language "' + language + '": ' + error.toString()));
    }
    let data;
    try {
      data = JSON.parse(content);
    } catch (exception) {
      return Promise.reject(new Error('invalid JSON localization data for language "' + language + '": ' + exception.toString()));
    }
    return Promise.resolve(data);
  }
}


/**
 * @param {string} languageDefault
 * @param {string} [languageFallback]
 * @author fenris
 */
export async function initialize (languageDefault, languageFallback = 'en') {
  _cache = new CacheLocalstorage('loc');
  _languageFallback = languageFallback;
  _languageDefault = languageDefault;
  for (const language of [_languageFallback, _languageDefault]) {
    if (_data.hasOwnProperty(language)) continue;
    console.log('--', 'loading localization data for language "' + language + '" ...');
    let data;
    try {
      data = await _cache.get(language, () => retrieveData(language));
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
 * @author fenris
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

