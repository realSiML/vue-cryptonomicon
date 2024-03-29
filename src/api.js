const API_KEY =
  "3f023d5763505553199c0744cba6a44ea5e9a3f990a7ffcc8a56ef80b382b9c3";

const tickersHandlers = new Map();
const tickersInvalidators = new Map();
// const tickersSubscriptionCount = new Map();

const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const channel = new BroadcastChannel("api_channel");

const AGGREGATE_INDEX = "5";
const SUBSCRIBE_COMPLETE = "16";
const UNSUBSCRIBE_COMPLETE = "17";
const INVALID_SUB = "500";

export let BTCSubscription = false;

socket.addEventListener("message", (e) => {
  const {
    TYPE: type,
    MESSAGE: message,
    SUB: sub,
    PARAMETER: parameter,
    FROMSYMBOL: currency,
    PRICE: newPrice,
  } = JSON.parse(e.data);

  // Подписка на BTC
  if (sub && extractFromSymbol(sub) === "BTC") {
    if (type === SUBSCRIBE_COMPLETE) {
      BTCSubscription = true;
    } else if (type === UNSUBSCRIBE_COMPLETE) {
      BTCSubscription = false;
    }
  }

  // Инвалидация (FOO -> USD => FOO -> BTC -> USD) - Невозможно из-за устаревшей информации в курсе
  if (type === INVALID_SUB && message === "INVALID_SUB") {
    // if (extractToSymbol(parameter) === "USD") {
    //   unsubscribeFromTickerOnWs(extractFromSymbol(parameter));
    //   subscribeToTickerOnWs(extractFromSymbol(parameter), "BTC");

    //   return;
    // } else {
    const currency = extractFromSymbol(parameter);
    const invalidator = tickersInvalidators.get(currency);

    if (invalidator) {
      invalidator();
    }

    return;
    // }
  }

  // Обновление новых цен
  if (type === AGGREGATE_INDEX && newPrice !== undefined) {
    const handlers = tickersHandlers.get(currency) ?? [];
    handlers.forEach((fn) => fn(newPrice));
    channel.postMessage({ currency: currency, newPrice: newPrice });
  }
});

channel.onmessage = (e) => {
  const { currency: currency, newPrice: newPrice } = e.data;
  const handlers = tickersHandlers.get(currency) ?? [];
  handlers.forEach((fn) => fn(newPrice));
};

function extractFromSymbol(sub) {
  return sub.split("~")[2];
}

// function extractToSymbol(sub) {
//   return sub.split("~")[3];
// }

function sendToWebSocket(message) {
  const stringifiedMessage = JSON.stringify(message);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(stringifiedMessage);
    return;
  }

  socket.addEventListener(
    "open",
    () => {
      socket.send(stringifiedMessage);
    },
    { once: true }
  );
}

function subscribeToTickerOnWs(fromSymbol, toSymbol = "USD") {
  sendToWebSocket({
    action: "SubAdd",
    subs: [`5~CCCAGG~${fromSymbol}~${toSymbol}`],
  });
}

function unsubscribeFromTickerOnWs(fromSymbol, toSymbol = "USD") {
  sendToWebSocket({
    action: "SubRemove",
    subs: [`5~CCCAGG~${fromSymbol}~${toSymbol}`],
  });
}

export const subscribeToTicker = (ticker, cb, invalidationFunc) => {
  const subscribers = tickersHandlers.get(ticker) || [];
  tickersHandlers.set(ticker, [...subscribers, cb]);
  tickersInvalidators.set(ticker, invalidationFunc);
  subscribeToTickerOnWs(ticker);
};

export const unsubscribeFromTicker = (ticker) => {
  tickersHandlers.delete(ticker);
  tickersInvalidators.delete(ticker);
  unsubscribeFromTickerOnWs(ticker);
};
