const mongoose = require('mongoose');
const config = require('../config/config');

const clearDatabase = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.databaseURI, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to database:', mongoose.connection.name);

    const collections = await mongoose.connection.db.collections();
    for (const col of collections) {
      const count = await col.countDocuments();
      await col.deleteMany({});
      console.log('Cleared ' + col.collectionName + ' (removed ' + count + ' documents)');
    }

    console.log('Database is now a completely clean slate.');
  } catch (error) {
    console.error('Error clearing database:', error.message);
  } finally {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  }
};

clearDatabase();
