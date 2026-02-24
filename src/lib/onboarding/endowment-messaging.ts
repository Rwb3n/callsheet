// Endowment effect messaging — S2 §5.2, AC-17
// Shows view count when >= 5 views (personal), category-level when < 5.

type EndowmentMessage = {
  type: "personal" | "category"
  text: string
}

const VIEW_THRESHOLD = 5

export function getEndowmentMessaging(
  profileViews: number,
  primaryServiceAreaName: string,
): EndowmentMessage {
  if (profileViews >= VIEW_THRESHOLD) {
    return {
      type: "personal",
      text: `Your listing has been viewed ${profileViews} times this month`,
    }
  }
  return {
    type: "category",
    text: `Buyers search for ${primaryServiceAreaName} on CALLSHEET`,
  }
}
