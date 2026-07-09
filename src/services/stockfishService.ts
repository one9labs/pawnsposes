type StockfishListener = (line: string) => void;

const ENGINE_PATH = '/stockfish.js';
const DEFAULT_DEPTH = 12;

class StockfishService {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private listeners = new Set<StockfishListener>();
  private commandQueue: Promise<void> = Promise.resolve();
  private generation = 0;

  private emit(line: string) {
    this.listeners.forEach((listener) => listener(line));
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(ENGINE_PATH);
    worker.onmessage = (event: MessageEvent<string>) => {
      const line = typeof event.data === 'string' ? event.data : String(event.data);
      this.emit(line);
    };
    worker.onerror = (error) => {
      console.error('Stockfish worker error:', error);
    };
    this.worker = worker;
    return worker;
  }

  private post(command: string) {
    this.ensureWorker().postMessage(command);
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.listeners.delete(onLine);
        reject(new Error(`Stockfish timed out waiting for response (${timeoutMs}ms)`));
      }, timeoutMs);

      const onLine = (line: string) => {
        if (this.generation !== generation) {
          window.clearTimeout(timer);
          this.listeners.delete(onLine);
          reject(new Error('Stockfish analysis cancelled'));
          return;
        }
        if (!predicate(line)) return;
        window.clearTimeout(timer);
        this.listeners.delete(onLine);
        resolve(line);
      };

      this.listeners.add(onLine);
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.commandQueue.then(task, task);
    this.commandQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      this.ensureWorker();
      this.post('uci');
      await this.waitFor((line) => line === 'uciok');
      this.post('setoption name Contempt value 0');
      this.post('isready');
      await this.waitFor((line) => line === 'readyok');
    })();

    try {
      await this.readyPromise;
    } catch (error) {
      this.readyPromise = null;
      this.terminate();
      throw error;
    }
  }

  async evaluatePosition(
    fen: string,
    depth = DEFAULT_DEPTH
  ): Promise<{ evaluation: number; bestMoveUci: string | null; depth: number }> {
    return this.enqueue(async () => {
      await this.init();

      let evaluation = 0;
      let resolvedDepth = 0;
      let bestMoveUci: string | null = null;
      const generation = this.generation;

      const onInfo = (line: string) => {
        if (this.generation !== generation) return;
        if (!line.startsWith('info ') || !line.includes(' score ')) return;

        const depthMatch = line.match(/\bdepth (\d+)\b/);
        if (depthMatch) {
          resolvedDepth = Math.max(resolvedDepth, parseInt(depthMatch[1], 10));
        }

        const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
        if (mateMatch) {
          const mateIn = parseInt(mateMatch[1], 10);
          evaluation = mateIn > 0 ? 100000 - mateIn * 100 : -100000 - mateIn * 100;
          return;
        }

        const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
        if (cpMatch) {
          evaluation = parseInt(cpMatch[1], 10);
        }
      };

      this.listeners.add(onInfo);

      try {
        this.post('stop');
        this.post(`position fen ${fen}`);
        this.post(`go depth ${depth}`);

        const bestMoveLine = await this.waitFor(
          (line) => line.startsWith('bestmove '),
          Math.max(20000, depth * 2500)
        );
        const match = bestMoveLine.match(/^bestmove\s+(\S+)/);
        bestMoveUci = match && match[1] !== '(none)' ? match[1] : null;
      } finally {
        this.listeners.delete(onInfo);
      }

      if (this.generation !== generation) {
        throw new Error('Stockfish analysis cancelled');
      }

      // Stockfish scores are from the side to move. Convert to white-centric.
      const sideToMove = fen.split(' ')[1];
      const whiteCentric = sideToMove === 'b' ? -evaluation : evaluation;

      return {
        evaluation: whiteCentric,
        bestMoveUci,
        depth: resolvedDepth || depth,
      };
    });
  }

  async newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.init();
      this.post('ucinewgame');
      this.post('isready');
      await this.waitFor((line) => line === 'readyok');
    });
  }

  terminate() {
    this.generation += 1;
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
        this.worker.postMessage('quit');
      } catch {
        // ignore
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.readyPromise = null;
    this.listeners.clear();
    this.commandQueue = Promise.resolve();
  }
}

export const stockfishService = new StockfishService();
export const STOCKFISH_DEPTH = DEFAULT_DEPTH;
