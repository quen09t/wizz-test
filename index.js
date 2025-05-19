/* eslint-disable no-use-before-define */
const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');
const db = require('./models');

const app = express();

app.use(bodyParser.json());
app.use(express.static(`${__dirname}/static`));

app.get('/api/games', (req, res) => db.Game.findAll()
  .then((games) => {
    res.send(games);
  })
  .catch((err) => {
    console.log('There was an error querying games', JSON.stringify(err));
    return res.send(err);
  }));

app.post('/api/games', (req, res) => {
  const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
  return db.Game.create({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
    .then((game) => res.send(game))
    .catch((err) => {
      console.log('***There was an error creating a game', JSON.stringify(err));
      return res.status(400).send(err);
    });
});

app.delete('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => game.destroy({ force: true }))
    .then(() => res.send({ id }))
    .catch((err) => {
      console.log('***Error deleting game', JSON.stringify(err));
      res.status(400).send(err);
    });
});

app.put('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => {
      const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
      return game.update({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
        .then(() => res.send(game))
        .catch((err) => {
          console.log('***Error updating game', JSON.stringify(err));
          res.status(400).send(err);
        });
    });
});

app.post('/api/games/search', (req, res) => {
  const { name, platform } = req.body;

  const whereClause = {};

  if (name) whereClause.name = { [Op.like]: `%${name}%` };
  if (platform) whereClause.platform = platform;

  return db.Game.findAll({
    where: whereClause,
  })
    .then((games) => res.send(games))
    .catch((err) => {
      console.log('***There was an error searching a game', JSON.stringify(err));
      return res.status(400).send(err);
    });
});

app.get('/api/games/populate', async (req, res) => {
  const urls = {
    ios: 'https://wizz-technical-test-dev.s3.eu-west-3.amazonaws.com/ios.top100.json',
    android: 'https://wizz-technical-test-dev.s3.eu-west-3.amazonaws.com/android.top100.json',
  };

  const [iosGames, androidGames] = await Promise.all([
    fetchGames(urls.ios, 'ios'),
    fetchGames(urls.android, 'android'),
  ]);

  try {
    const allGames = [...iosGames, ...androidGames];

    const existingGames = await db.Game.findAll({
      attributes: ['name'],
    });

    // `ignoreDuplicates` doesn't work here because there are no constraints
    // to prevent duplicate entries during bulk insert
    const existingNames = new Set(existingGames.map((game) => cleanString(game.name)));
    const newGames = allGames.filter((game) => !existingNames.has(cleanString(game.name)));

    await db.Game.bulkCreate(newGames);

    return res.status(201).json(newGames);
  } catch (err) {
    console.error('DB insert error:', err.message);
    return res.status(500).send('Internal error while inserting games');
  }
});

// Add Test to this function
async function fetchGames(url, platform) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${platform} fetch failed: ${response.status}`);
    const data = await response.json();

    return data.flat()
      .filter((game) => game.name)
      .slice(0, 100)
      .map((game) => ({
        publisherId: game.publisher_id,
        name: cleanString(game.name),
        platform,
        storeId: game.app_id,
        bundleId: game.bundle_id,
        appVersion: game.version,
        isPublished: !!game.release_date,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
  } catch (err) {
    console.error(`Error fetching ${platform} games:`, err.message);
    return [];
  }
}

// Add Test to this function
function cleanString(str) {
  if (!str) return '';

  return str
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .normalize('NFC')
    .trim();
}

app.listen(3000, () => {
  console.log('Server is up on port 3000');
});

module.exports = app;
