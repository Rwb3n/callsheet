// Quality methodology — S5 §4.1, CS-WORK-044 AC-15
// Static SSG page explaining quality scoring methodology.

export default function QualityMethodologyPage() {
  return (
    <main>
      <h1>Quality Score Methodology</h1>

      <section>
        <h2>How Quality Scores Work</h2>
        <p>
          Every listing on CALLSHEET receives a quality score from 0 to 100.
          This score reflects how complete, accurate, and up-to-date your listing
          is. Higher quality scores improve your search ranking and visibility.
        </p>
      </section>

      <section>
        <h2>Five Dimensions</h2>

        <h3>Completeness (0&ndash;25)</h3>
        <p>
          Measures how many profile fields are filled in: headline, bio, contact
          details, portfolio images, credits, and taxonomy tags.
        </p>

        <h3>Freshness (0&ndash;25)</h3>
        <p>
          Measures how recently your listing was updated. Listings that haven't
          been edited in over 6 months receive a decay penalty.
        </p>

        <h3>Accuracy (0&ndash;20)</h3>
        <p>
          Measures data consistency: valid contact details, matching Companies
          House records, and no conflicting information.
        </p>

        <h3>Richness (0&ndash;15)</h3>
        <p>
          Measures depth of content: portfolio images, credits with details,
          social profile links, and accreditations.
        </p>

        <h3>Verification (0&ndash;15)</h3>
        <p>
          Measures trust signals: verification tier, number of verification
          methods completed, and client-confirmed credits.
        </p>
      </section>

      <section>
        <h2>Improving Your Score</h2>
        <p>
          Your dashboard shows the top 3 actions that would most improve your
          quality score, with direct links to the relevant profile editor
          sections.
        </p>
      </section>
    </main>
  )
}
