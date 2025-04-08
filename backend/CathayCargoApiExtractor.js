const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

class CathayCargo {
  constructor() {
    this.baseUrl = 'https://www.cathaycargo.com';
    this.apiUrl = `${this.baseUrl}/content/cargo/en-us/home.APIToken.JSON`;
    this.lastTokenRefresh = null;
    this.tokenExpiryMs = 50 * 60 * 1000; // 50 minutes in milliseconds (tokens last 1 hour)

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
      timeout: 15000, // 15 seconds timeout
    }));
  }

  async refreshCookies() {
    console.log('Refreshing cookies...');

    try {
      // First visit the home page to get initial cookies
      const homeResponse = await this.session.get('/en-us.html');
      if (homeResponse.status !== 200) {
        console.error(`Failed to access home page: ${homeResponse.status}`);
      }

      // Then get the token API endpoint
      const tokenResponse = await this.session.get(this.apiUrl);
      const cookies = await this.jar.getCookies(this.baseUrl);
      console.log(`Cookie refresh complete. Got ${cookies.length} cookies.`);
      
      // Sleep for 1 second to ensure cookies are properly set
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return tokenResponse.status === 200;
    } catch (err) {
      console.error('Error refreshing cookies:', err.message);
      if (err.response) {
        console.error(`Response status: ${err.response.status}`);
      }
      return false;
    }
  }

  async makeApiRequest(endpoint, forceRefresh = false) {
    // Check if token might be expired based on last refresh time
    const tokenMightBeExpired = this.lastTokenRefresh && 
      (Date.now() - this.lastTokenRefresh > this.tokenExpiryMs);
      
    if (forceRefresh || tokenMightBeExpired) {
      console.log('Token may be expired or refresh forced, refreshing cookies...');
      await this.refreshCookies();
    }

    try {
      const response = await this.session.get(endpoint);
      if ([401, 403, 440].includes(response.status)) {
        console.warn(`Got status code ${response.status}, attempting cookie refresh`);
        
        // Try up to 3 times to refresh cookies if needed
        let refreshSuccess = false;
        for (let i = 0; i < 3; i++) {
          console.log(`Cookie refresh attempt ${i+1}/3`);
          refreshSuccess = await this.refreshCookies();
          if (refreshSuccess) break;
          // Wait a bit between attempts
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (!refreshSuccess) {
          console.error('Failed to refresh cookies after multiple attempts');
          return null;
        }
        
        return await this.session.get(endpoint);
      }
      return response;
    } catch (err) {
      console.error('API request error:', err.message);
      if (err.response) {
        console.error(`Response status: ${err.response.status}`);
        
        // If we get an authentication error, try to refresh cookies once
        if ([401, 403, 440].includes(err.response.status)) {
          console.log('Authentication error, attempting to refresh cookies and retry');
          const refreshSuccess = await this.refreshCookies();
          if (refreshSuccess) {
            try {
              return await this.session.get(endpoint);
            } catch (retryErr) {
              console.error('Error in retry after cookie refresh:', retryErr.message);
            }
          }
        }
      }
      return null;
    }
  }

  async getApiToken() {
    // Force cookie refresh before getting token
    await this.refreshCookies();
    
    const response = await this.makeApiRequest(this.apiUrl);
    if (response && response.status === 200) {
      try {
        const tokenData = response.data;
        if (tokenData && tokenData.access_token) {
          this.lastTokenRefresh = Date.now();
          console.log(`Successfully retrieved new API token, expires in ${this.tokenExpiryMs/60000} minutes`);
        }
        return tokenData;
      } catch (err) {
        console.error('Could not parse JSON response:', err.message);
        return null;
      }
    } else {
      console.error(`Failed to get API token. Status code: ${response?.status}`);
      return null;
    }
  }
  
  isTokenExpired() {
    // Check if token is likely expired based on when we last refreshed it
    if (!this.lastTokenRefresh) return true;
    return (Date.now() - this.lastTokenRefresh) > this.tokenExpiryMs;
  }
}

module.exports = CathayCargo;