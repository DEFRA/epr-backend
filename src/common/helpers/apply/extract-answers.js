export function extractAnswers(payload) {
  return payload?.meta?.definition?.pages?.reduce((prev, { components }) => {
    const values = components.reduce(
      (prevComponents, { name, shortDescription, title, type }) => {
        const value = payload?.data?.main?.[name]

        return value
          ? [
              ...prevComponents,
              {
                shortDescription,
                title,
                type,
                value
              }
            ]
          : prevComponents
      },
      []
    )

    return values.length ? [...prev, ...values] : prev
  }, [])
}
