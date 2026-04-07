const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api/donors',        require('./routes/donor'));
app.use('/api/donations',     require('./routes/donation'));
app.use('/api/foods',         require('./routes/food'));
app.use('/api/ngos',          require('./routes/ngo'));
app.use('/api/volunteers',    require('./routes/volunteer'));
app.use('/api/recipients',    require('./routes/recipient'));
app.use('/api/distributions', require('./routes/distribution'));

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});