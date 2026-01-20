import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { Mempool } from "./mempool.js";
import { State } from "./state.js";

export function startRpc(mem: Mempool, state: State, port = 8545) {
  const app = express();
  app.use(bodyParser.json());

  app.post("/", async (req: Request, res: Response) => {
    const { method, params, id } = req.body;
    try {
      switch (method) {
        case "podo_submitTx":
          await mem.add(params.tx);
          return res.json({ jsonrpc: "2.0", id, result: "ok" });
        case "podo_getBalance":
          return res.json({
            jsonrpc: "2.0",
            id,
            result: await state.getBalance(params.address),
          });
        case "podo_getHead":
          return res.json({ jsonrpc: "2.0", id, result: "head-placeholder" });
        default:
          return res.status(400).json({ jsonrpc: "2.0", id, error: "method not found" });
      }
    } catch (e: any) {
      return res.status(500).json({ jsonrpc: "2.0", id, error: e.message });
    }
  });

  app.listen(port, () => console.log(`JSON-RPC listening on :${port}`));
}
