const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

class CathayCargo {
  constructor() {
    this.baseUrl = 'https://www.cathaycargo.com';
    this.apiUrl = `${this.baseUrl}/content/cargo/en-us/home.APIToken.JSON`;

    this.jar = new CookieJar();
    this.session = wrapper(axios.create({
      baseURL: this.baseUrl,
      jar: this.jar,
      withCredentials: true,
      headers: {
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        'referer': 'https://www.cathaycargo.com/en-us/flight-schedule/results.html?DXEQLEEBNvrj+QCWviMCB+dW7Wpk4NDrZCVF4s3o1qpKTdZZB8Kz0ZFaU2BxuppxwjfBBhlicgLk/P7bzFb4jTf4QlbZZlC0n1acGBtHCPoquYTZJbx7FSb0ZV2o3u0NaMqgZ5dSEh98vMxtrF0gq9PX0DVJRT5TFNLmyBuiWkbwJAcV19jGLxO99CmKSahOW6o1Jyx9AZyDrJdr/1tTsg==',
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      },
    }));
  }

  async refreshCookies() {
    console.log('Refreshing cookies...');

    try {
      await this.session.get('/en-us.html');
      const response = await this.session.get(this.apiUrl);
      const cookies = await this.jar.getCookies(this.baseUrl);
      console.log(`Cookie refresh complete. Got ${cookies.length} cookies.`);
      return response.status === 200;
    } catch (err) {
      console.error('Error refreshing cookies:', err.message);
      return false;
    }
  }

  async makeApiRequest(endpoint, forceRefresh = false) {
    if (forceRefresh) {
      await this.refreshCookies();
    }

    try {
      const response = await this.session.get(endpoint);
      if ([401, 403, 440].includes(response.status)) {
        console.warn(`Got status code ${response.status}, attempting cookie refresh`);
        await this.refreshCookies();
        return await this.session.get(endpoint);
      }
      return response;
    } catch (err) {
      console.error('API request error:', err.message);
      return null;
    }
  }

  async getApiToken() {
    const response = await this.makeApiRequest(this.apiUrl);
    if (response && response.status === 200) {
      try {
        return response.data;
      } catch {
        console.error('Could not parse JSON response');
        return null;
      }
    } else {
      console.error(`Failed to get API token. Status code: ${response?.status}`);
      return null;
    }
  }
}

module.exports = CathayCargo;