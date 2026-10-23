import type {Pool,PoolClient} from 'pg';
export function seedUpgrade(client:Pool|PoolClient):Promise<void>;

export function seedRouting(client:Pool|PoolClient):Promise<void>;
