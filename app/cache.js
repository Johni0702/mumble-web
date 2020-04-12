
export /*abstract */class Cache {
  /**
   * @param {string} key
   * @return {boolean}
   * @author svartoyg
   */
  /*protected */has(key) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @return {any}
   * @author svartoyg
   */
  /*protected */fetch(key) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @param {any} value
   * @author svartoyg
   */
  /*protected */store(key, value) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @param {()=>Promise<any>} retrieve
   * @return {Promise<any>}
   * @author svartoyg
   */
  /*public */async get(key, retrieve) {
    if (this.has(key)) {
      const value = this.fetch(key);
      return Promise.resolve(value);
    } else {
      const value = await retrieve();
      this.store(key, value);
      return Promise.resolve(value);
    }
  }
}


/**
 * @author svartoyg
 */
export class CacheNone extends Cache {
  /**
   * @author svartoyg
   */
  /*public */constructor() {
    super();
  }
  
  /**
   * @author svartoyg
   */
  /*protected */has(key) {
    return false;
  }
  
  /**
   * @author svartoyg
   */
  /*protected */fetch(key) {
    throw (new Error('not possible'));
  }
  
  /**
   * @author svartoyg
   */
  /*protected */store(key, value) {
  }
}


/**
 * @author svartoyg
 */
export class CacheLocalstorage extends Cache {
  /**
   * @param {string} [corner] for separating the cache instance from others
   * @author svartoyg
   */
  /*public */constructor(corner = null) {
    super();
    this.corner = corner;
  }
  
  /**
   * @author svartoyg
   */
  /*private */augmentKey(key) {
    return ((this.corner === null) ? key : (this.corner + '/' + key));
  }
  
  /**
   * @author svartoyg
   */
  /*protected */has(key) {
    return (window.localStorage.getItem(this.augmentKey(key)) !== null);
  }
  
  /**
   * @author svartoyg
   */
  /*protected */fetch(key) {
    const valueRaw = window.localStorage.getItem(this.augmentKey(key));
    const value = JSON.parse(valueRaw);
    return value;
  }
  
  /**
   * @author svartoyg
   */
  /*protected */store(key, value) {
    const valueRaw = JSON.stringify(value);
    window.localStorage.setItem(this.augmentKey(key), valueRaw);
  }
}

