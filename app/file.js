
/**
 * @param {string} path
 * @return Promise<string>
 * @todo use Util.fetch instead?
 * @author fenris
 */
export async function read (path) {
  return (
    new Promise(
      (resolve, reject) => {
        let request = new XMLHttpRequest();
        request.open('GET', '/' + path, true);
        request.onreadystatechange = () => {
          switch (request.readyState) {
            case XMLHttpRequest.DONE: {
              switch (request.status) {
                case 0: {
                  reject(new Error('XMLHttpRequest failed'));
                  break;
                }
                default: {
                  resolve(request.responseText);
                  break;
                }
              }
              break;
            }
            default: {
              console.warn('unhandled readyState "' + request.readyState + '"');
              break;
            }
          }
        };
        request.send(null);
      }
    )
  );
}

