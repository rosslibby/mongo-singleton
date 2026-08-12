module.exports = {
  uri: 'mongodb://from-fixture-config:27017',
  database: 'fixtureDb',
  clients: {
    analytics: { uri: 'mongodb://analytics-fixture:27017', database: 'analyticsFixtureDb' },
  },
};
