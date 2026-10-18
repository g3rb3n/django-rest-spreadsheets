const RestApi6 = (() => {

  function objectToFormData(obj) {
    const formData = new FormData();
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          // One entry per item; a lone empty one for an empty list.
          if (!value.length) formData.append(key, '');
          value.forEach(item => formData.append(key, item));
        } else if (value !== null && value !== undefined) {
          formData.append(key, value);
        }
      }
    }
    return formData;
  }

  const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];

  /**
   * Read the CSRF header name and token rendered by the template
   * in <script id="drf_csrf">.
   */
  function csrfConfig() {
    const element = document.getElementById('drf_csrf');
    if (!element) return null;
    try {
      return JSON.parse(element.textContent);
    } catch (error) {
      console.error('Invalid CSRF config in #drf_csrf', error);
      return null;
    }
  }

  async function request(method, url, data = null) {
    const options = {
      method,
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'same-origin',
    };
    if (!SAFE_METHODS.includes(method)) {
      const csrf = csrfConfig();
      if (csrf && csrf.csrfToken) {
        options.headers[csrf.csrfHeaderName || 'X-CSRFToken'] = csrf.csrfToken;
      }
    }
    if (data !== null) {
      //options.headers['Content-Type'] = 'application/json';
      options.body = objectToFormData(data);
    }

    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get('content-type') || '';
      let responseData = null;

      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        // HTTP error status
        throw { status: response.status, data: responseData };
      }

      return responseData;

    } catch (error) {
      // error can be network failure or our throw above
      throw error;
    }
  }

  return {
    get: (url) => request('GET', url),
    options: (url) => request('OPTIONS', url),
    delete: (url) => request('DELETE', url),
    post: (url, data) => request('POST', url, data),
    put: (url, data) => request('PUT', url, data),
    patch: (url, data) => request('PATCH', url, data),
  };
})();