
export /*abstract */class Cache {
  /**
   * @param {string} key
   * @return {boolean}
   * @author fenris
   */
  /*protected */has(key) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @return {any}
   * @author fenris
   */
  /*protected */fetch(key) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @param {any} value
   * @author fenris
   */
  /*protected */store(key, value) {
    throw (new Error('not implemented'));
  }
  
  /**
   * @param {string} key
   * @param {()=>Promise<any>} retrieve
   * @return {Promise<any>}
   * @author fenris
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
 * @author fenris
 */
class CacheNone extends Cache {
  /**
   * @author fenris
   */
  /*public */constructor() {
    super();
  }
  
  /**
   * @author fenris
   */
  /*protected */has(key) {
    return false;
  }
  
  /**
   * @author fenris
   */
  /*protected */fetch(key) {
    throw (new Error('not possible'));
  }
  
  /**
   * @author fenris
   */
  /*protected */store(key, value) {
  }
}


/**
 * @author fenris
 */
export class CacheLocalstorage extends Cache {
  /**
   * @param {string} [corner] for separating the cache instance from others
   * @author fenris
   */
  /*public */constructor(corner = null) {
    super();
    this.corner = corner;
  }
  
  /**
   * @author fenris
   */
  /*private */augmentKey(key) {
    return ((this.corner === null) ? key : (this.corner + '/' + key));
  }
  
  /**
   * @author fenris
   */
  /*protected */has(key) {
    return (window.localStorage.getItem(this.augmentKey(key)) !== null);
  }
  
  /**
   * @author fenris
   */
  /*protected */fetch(key) {
    const valueRaw = window.localStorage.getItem(this.augmentKey(key));
    const value = JSON.parse(valueRaw);
    return value;
  }
  
  /**
   * @author fenris
   */
  /*protected */store(key, value) {
    const valueRaw = JSON.stringify(value);
    window.localStorage.setItem(this.augmentKey(key), valueRaw);
  }
}

