import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { capacities } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function user(){return (await auth.api.getSession({headers:await headers()}))?.user;}
export async function GET(){const actor=await user();if(!actor)return NextResponse.json({error:"Nepřihlášený uživatel"},{status:401});return NextResponse.json(await getDb().select().from(capacities).where(eq(capacities.ownerId,actor.id)).orderBy(desc(capacities.createdAt)));}
export async function POST(request:Request){const actor=await user();if(!actor)return NextResponse.json({error:"Nepřihlášený uživatel"},{status:401});const body=await request.json();if(!body.name?.trim()||!body.role?.trim())return NextResponse.json({error:"Doplňte jméno a roli."},{status:400});const skills=String(body.skills||"").split(",").map(x=>x.trim()).filter(Boolean);const [item]=await getDb().insert(capacities).values({name:body.name.trim(),role:body.role.trim(),skills,location:body.location||null,availability:body.availability||null,ownerId:actor.id}).returning();return NextResponse.json(item,{status:201});}
