import express from 'express';
import path from 'path';

const app = express();
const port = 3001;

// Cross-origin support for benchmarking
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

// Silence noise from Chrome DevTools/Extensions discovery
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    res.status(204).end();
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
    console.log(`Target app listening at http://localhost:${port}`);
});
