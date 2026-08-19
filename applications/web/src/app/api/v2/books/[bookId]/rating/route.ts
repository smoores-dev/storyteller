import { NextResponse } from "next/server"

import { withUser } from "@/auth/auth"
import {
  type RatingDimensionScores,
  isValidDimensionScores,
} from "@/database/ratingDimensions"
import {
  deleteUserBookRating,
  getUserBookRating,
  setUserBookRating,
} from "@/database/userRatings"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

/**
 * @summary Get the current user's rating for a book
 */
export const GET = withUser<Params>(async (request, context) => {
  const { bookId } = await context.params
  const rating = await getUserBookRating(request.auth.user.id, bookId)
  if (!rating) return new Response(null, { status: 404 })
  return NextResponse.json(rating)
})

/**
 * @summary Set or update the current user's rating/review for a book
 */
export const PUT = withUser<Params>(async (request, context) => {
  const { bookId } = await context.params
  const body = (await request.json()) as {
    rating?: number | null
    review?: string | null
    dimensions?: RatingDimensionScores | null
  }

  if (body.rating == null && body.review == null && body.dimensions == null) {
    return NextResponse.json(
      { message: "Either rating, review, or dimensions must be provided" },
      { status: 405 },
    )
  }

  if (body.rating != null && (body.rating < 0 || body.rating > 5)) {
    return NextResponse.json(
      { message: "Rating must be a number between 0 and 5" },
      { status: 405 },
    )
  }

  if (body.dimensions != null && !isValidDimensionScores(body.dimensions)) {
    return NextResponse.json(
      { message: "Dimension scores must be numbers between 0 and 5" },
      { status: 405 },
    )
  }

  const updated = await setUserBookRating(request.auth.user.id, bookId, body)
  return updated
    ? NextResponse.json(updated)
    : new Response(null, { status: 204 })
})

/**
 * @summary Remove the current user's rating for a book
 */
export const DELETE = withUser<Params>(async (request, context) => {
  const { bookId } = await context.params
  await deleteUserBookRating(request.auth.user.id, bookId)
  return new Response(null, { status: 204 })
})
