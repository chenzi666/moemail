import { createDb } from "@/lib/db"
import { and, eq, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails, messages } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const PAGE_SIZE = 20

function normalizeDomainFilter(value: string | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function normalizeSearchFilter(value: string | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized.slice(0, 128) : null
}

function createDomainFilterCondition(domain: string): SQL {
  return eq(
    sql`LOWER(SUBSTR(${emails.address}, INSTR(${emails.address}, '@') + 1))`,
    domain
  )
}

function createSearchFilterCondition(search: string): SQL {
  return gt(sql<number>`INSTR(LOWER(${emails.address}), ${search})`, 0)
}

export async function GET(request: Request) {
  const userId = await getUserId()

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const domainFilter = normalizeDomainFilter(searchParams.get('domain'))
  const searchFilter = normalizeSearchFilter(searchParams.get('search'))
  
  const db = createDb()

  try {
    const baseConditions = and(
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date()),
      ...(domainFilter ? [createDomainFilterCondition(domainFilter)] : []),
      ...(searchFilter ? [createSearchFilterCondition(searchFilter)] : [])
    )

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    const conditions = [baseConditions]

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      conditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...conditions),
      orderBy: (emails, { desc }) => [
        desc(emails.createdAt),
        desc(emails.id)
      ],
      limit: PAGE_SIZE + 1
    })
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          results[PAGE_SIZE - 1].createdAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ 
      emails: emailList,
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId()

  try {
    const { ids } = await request.json<{ ids?: string[] }>()
    const uniqueIds = Array.from(new Set(ids?.filter(Boolean) || []))

    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "No email ids provided" },
        { status: 400 }
      )
    }

    const db = createDb()
    const ownedEmails = await db.select({ id: emails.id })
      .from(emails)
      .where(and(
        eq(emails.userId, userId!),
        inArray(emails.id, uniqueIds)
      ))

    const ownedIds = ownedEmails.map(email => email.id)

    if (ownedIds.length === 0) {
      return NextResponse.json(
        { error: "No matching emails found" },
        { status: 404 }
      )
    }

    await db.delete(messages)
      .where(inArray(messages.emailId, ownedIds))

    await db.delete(emails)
      .where(and(
        eq(emails.userId, userId!),
        inArray(emails.id, ownedIds)
      ))

    return NextResponse.json({
      success: true,
      deleted: ownedIds.length
    })
  } catch (error) {
    console.error('Failed to batch delete emails:', error)
    return NextResponse.json(
      { error: "Failed to delete emails" },
      { status: 500 }
    )
  }
}
