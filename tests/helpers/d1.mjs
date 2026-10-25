import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function testDatabase() {
 const database = new DatabaseSync(':memory:');
 database.exec(readFileSync(new URL('../../migrations/0001_newsletter.sql', import.meta.url), 'utf8'));
 database.exec(readFileSync(new URL('../../migrations/0002_studio.sql', import.meta.url), 'utf8'));
 return {
  prepare(sql) {
   let params=[];
   return { bind(...values){params=values;return this}, async first(){return database.prepare(sql).get(...params)||null},async all(){return {results:database.prepare(sql).all(...params)}},async run(){return this.runSync()},runSync(){const r=database.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}} };
  },
  async batch(statements){database.exec('BEGIN');try{const results=statements.map(s=>s.runSync());database.exec('COMMIT');return results}catch(e){database.exec('ROLLBACK');throw e}},
  close(){database.close()},
 };
}
