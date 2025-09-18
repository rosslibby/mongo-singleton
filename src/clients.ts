import {
  InitClientProps,
  UseClientResponse,
} from './types';
import { MongoSingleton } from './mongo-singleton';

type SingletonClients = Record<string, MongoSingleton>;

class State {
  private _clients: SingletonClients = {};

  public add: (clientId: string, client: MongoSingleton) => void;
  public set: (client: SingletonClients) => void;
  public get: (clientId: string) => MongoSingleton | undefined;
  public clients: SingletonClients;

  constructor() {
    this.add = this.addClient.bind(this);
    this.set = this.setClient.bind(this);
    this.get = this.getClient.bind(this);
    this.clients = this._clients;
  }

  private addClient(clientId: string, client: MongoSingleton): void {
    if (this._clients[clientId]) {
      console.warn(`A client with ID ${clientId} already exists.`)
    } else {
      this.setClient({ [clientId]: client });
    }
  }

  private setClient(client: SingletonClients): void {
    this._clients = { ...this._clients, ...client };
    this.clients = this._clients;
  }

  public getClient(clientId: string): MongoSingleton | undefined {
    return this._clients[clientId];
  }
  public getClients(): SingletonClients {
    return this._clients;
  }
}
const state = new State();

class Stateful {
  private clientId: string;
  public client: MongoSingleton;
  public set: (client: MongoSingleton) => void;
  public get: () => MongoSingleton;

  constructor(clientId: string, props?: InitClientProps) {
    this.set = this.update.bind(this);
    this.get = this.getClient.bind(this);
    this.clientId = clientId;
    this.client = state.get(clientId) || this.createClient(props);
  }

  private createClient(props?: InitClientProps): MongoSingleton {
    const client = new MongoSingleton(props);
    state.add(this.clientId, client);
    this.update(client);
    return client;
  }

  private getClient(): MongoSingleton {
    return state.get(this.clientId) as MongoSingleton;
  }

  private update(
    value: MongoSingleton | ((v: MongoSingleton) => MongoSingleton),
  ) {
    if (typeof value === 'function') {
      value = value(this.getClient());
    }

    state.set({ [this.clientId]: value });
    this.client = value;
  }
}

export const useClient = (
  clientId: string,
  props?: InitClientProps,
): UseClientResponse => {
  const { client } = new Stateful(clientId, props);

  return {
    client,
    collection: client.collection,
    db: client.db,
  };
};
