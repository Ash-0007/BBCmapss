const express = require('express');
const router = express.Router();
const axios = require('axios');


router.post('/vessel-arrival', async (req, res) => {
  try {
    const { port, startDate, endDate } = req.body;
    const response = await axios.post('https://ss.shipmentlink.com/tvs2/jsp/TVS2_VesselArrivalTimeResult.jsp', {
      queryBy: 'port',
      fmMonth: startDate.substring(4, 6),
      fmDay: startDate.substring(6, 8),
      fmYear: startDate.substring(0, 4),
      toMonth: endDate.substring(4, 6),
      toDay: endDate.substring(6, 8),
      toYear: endDate.substring(0, 4),
      fmDate: startDate,
      toDate: endDate,
      tradecode: 'ALL',
      port_name: `COCHIN (${port}) [ZIP:682001]`,
      port: port,
      line: '',
      vessel_voyage: '',
      vessel_voyage_hidden: '',
      queryByAfterSubmit: 'port',
      usa_io: '',
      sort: '1',
      sort_Sailing: '1',
      sort_US: '1',
      sort_CA: '1',
      sort_MX: '1',
      sort_CN: '1',
      sort_EU: '1',
      sort_JP: '1',
      thisPage: 'Vessel Sailing Schedule',
      nowPage: '1'
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    res.send(response.data);
  } catch (error) {
    console.error('Error in vessel-arrival route:', error);
    res.status(500).send('Error fetching vessel arrival data');
  }
});


router.post('/vessel-detail', async (req, res) => {
  try {
    const { url, params, resolve } = req.body;
    

    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    

    const response = await axios.get(`${url}?${queryString}`, {
      headers: {
        'Host': resolve.host,
        'Connection': 'keep-alive'
      },
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });
    
    res.send(response.data);
  } catch (error) {
    console.error('Error in vessel-detail route:', error);
    res.status(500).send('Error fetching vessel detail data');
  }
});

module.exports = router; 