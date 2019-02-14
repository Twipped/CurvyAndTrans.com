const log = require('fancy-log');
const aws = require('aws-sdk');
var credentials = require('../aws.json');
var Promise = require('bluebird');

module.exports = exports = async function invalidateCloudfront () {
  var cloudfront = new aws.CloudFront();
  cloudfront.config.update({ credentials });

  var wait = async function (id) {
    const res = await cloudfront.getInvalidation({
      DistributionId: credentials.distribution,
      Id: id,
    }).promise();

    if (res.Invalidation.Status === 'Completed') {
      return;
    }

    return Promise.delay(5000).then(() => wait(id));
  };

  const { Invalidation } = await cloudfront.createInvalidation({
    DistributionId: credentials.distribution,
    InvalidationBatch: {
      CallerReference: Date.now().toString(),
      Paths: {
        Quantity: 1,
        Items: [ '/*' ],
      },
    },
  }).promise();

  const id = Invalidation.Id;

  log('Invalidation created, waiting for it to complete.', id);

  await wait(id);
};

