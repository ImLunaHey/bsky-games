import { serve } from '@hono/node-server';
import { Jetstream } from '@skyware/jetstream';
import { Hono } from 'hono';

const threadId = '3lci2yuj3gc26';
const did = 'did:plc:k6acu4chiwkixvdedcmdgmal';
const threadUri = `at://${did}/app.bsky.feed.post/${threadId}`;

const generateBoard = (columns: number, rows: number) => {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => '#ffffff'));
};

const board = generateBoard(50, 50);

const updateBoard = (text: string) => {
  const items = text.split(' ');
  const x = parseInt(items[0]);
  const y = parseInt(items[1]);
  const colour = items[2];

  console.info(`Updating board at ${x}, ${y} to ${colour}`);
  board[x][y] = colour;
};

const jetstream = new Jetstream({
  wantedCollections: ['app.bsky.feed.post'],
  wantedDids: [],
});

jetstream.onCreate('app.bsky.feed.post', async (event) => {
  // only watch comments
  if (!event.commit.record.reply) return;
  if (event.commit.record.reply.root.uri !== threadUri) return;

  const text = event.commit.record.text;

  // validate the text
  if (!text.match(/^\d+ \d+ #[0-9a-f]{6}$/) && !text.match(/^\d+ \d+ (red|green|blue|yellow|purple|orange|black|white)$/)) {
    return;
  }

  updateBoard(text);
});

const createAppWrapper = (html: string) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Board game</title>
        <style>body{font-family:'Courier New',monospace;font-size:.9rem;background-color:#121212;color:#e0e0e0;line-height:1.4;margin:2rem}a:link{color:#55cdfc;text-decoration:none}a:visited{color:#f7a8b8}a:hover{color:#b19cd9;text-decoration:underline}h1,h2{color:#b19cd9;margin-bottom:1rem}</style>
        <script defer data-domain="games.imlunahey.com" src="https://plausible.io/js/script.js"></script>
        <style>table {border-collapse: collapse;}td {width: 10px;height: 10px;}</style>
        <style>td {border: 1px solid #000;}</style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
};

const app = new Hono();

const main = async () => {
  const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${threadUri}`).then(
    (res) =>
      res.json() as Promise<{
        thread?: {
          replies?: {
            post?: {
              record?: {
                text?: string;
              };
            };
          }[];
        };
      }>,
  );

  const replies = response.thread?.replies?.flatMap((reply) => reply.post?.record?.text) ?? [];
  const commands = replies.filter(
    (reply) =>
      // hex colours
      reply?.match(/^\d+ \d+ #[0-9a-f]{6}$/) ||
      // named colours
      reply?.match(/^\d+ \d+ (red|green|blue|yellow|purple|orange|black|white)$/),
  );

  console.info(`Found ${replies.length} replies, ${commands.length} are commands`);

  for (const command of commands) {
    if (command) {
      updateBoard(command);
    }
  }

  app.get('/', (ctx) => {
    return ctx.html(
      createAppWrapper(`
        <h1>Board game</h1>
        <p>Comment on <a href="${`https://bsky.app/profile/did:plc:k6acu4chiwkixvdedcmdgmal/post/${threadId}`}">the thread</a> to update the board</p>
        <p>Commands: x y colour</p>
        <p>Example: 10 10 #ff0000</p>
        <script>
          setInterval(() => {
            fetch('/board')
              .then((res) => res.text())
              .then((html) => {
                document.querySelector('table').outerHTML = html;
              });
          }, 5_000);
        </script>
        <table>
          ${board
            .map((row) => `<tr>${row.map((colour) => `<td style="background-color: ${colour}"></td>`).join('')}</tr>`)
            .join('')}
        </table>
      `),
    );
  });

  app.get('/board', (ctx) => {
    return ctx.html(`
        <table>
          ${board
            .map((row) => `<tr>${row.map((colour) => `<td style="background-color: ${colour}"></td>`).join('')}</tr>`)
            .join('')}
        </table>
      `);
  });

  // Start the web server
  serve(app, (info) => {
    console.log(`🤖 running webserver at http://${info.address}:${info.port}`);
  });

  jetstream.start();
};

main().catch(console.error);
