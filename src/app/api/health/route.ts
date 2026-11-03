import {db} from '@/lib/db';
export const runtime='nodejs';
export async function GET(){try{await db().$queryRaw`SELECT 1`;return Response.json({status:'ready'},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}}
