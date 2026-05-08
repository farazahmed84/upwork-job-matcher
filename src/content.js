const JOB_LIST_CHECK_INTERVAL_MS = 500;
let lastJobSignature = "";
let freelancerProfile = null;

async function getFreelancerProfile() {
  const data = await chrome.storage.local.get([
    "profileTitle",
    "profileDescription",
    "profileSkills"
  ]);

  if (
    !data.profileTitle ||
    !data.profileDescription ||
    !Array.isArray(data.profileSkills) ||
    data.profileSkills.length === 0
  ) {
    return null;
  }

  return {
    title: data.profileTitle,
    description: data.profileDescription,
    skills: data.profileSkills
  };
}

function waitForJobListings() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const resultSection = document.querySelector(
        'section[data-ev-label="search_result_impression"]'
      );
      const jobCards = resultSection?.querySelectorAll("article");

      if (jobCards?.length > 0) {
        clearInterval(checkInterval);
        resolve(Array.from(jobCards));
      }
    }, JOB_LIST_CHECK_INTERVAL_MS);
  });
}

function getJobSignature(jobCards) {
  return jobCards
    .map((job) => job.innerText.trim().slice(0, 200))
    .join("|");
}

function cleanText(text) {
  return text
    .replace(/[\r\t]/g, " ")
    .replace(/\u2022/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJobSkills(jobCard) {
  return Array.from(jobCard.querySelectorAll('[data-test="token"]'))
    .map((skill) => cleanText(skill.innerText))
    .filter(Boolean);
}

function extractJobs(jobCards) {
  return jobCards
    .map((jobCard) => {
      const titleElement = jobCard.querySelector("h2.job-tile-title a");
      // const descriptionElement = jobCard.querySelector(
      //   'div[data-test*="JobDescription"] p.mb-0'
      // );

      if (!titleElement) {
        return null;
      }

      return {
        element: jobCard,
        titleElement,
        title: cleanText(titleElement.innerText),
        // description: descriptionElement
        //   ? cleanText(descriptionElement.innerText)
        //   : "",
        skills: extractJobSkills(jobCard)
      };
    })
    .filter(Boolean);
}

function getWords(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normalizePhrase(text) {
  return getWords(text).join(" ");
}

function wordsMatch(profileWord, jobWord) {
  return (
    profileWord === jobWord ||
    profileWord.includes(jobWord) ||
    jobWord.includes(profileWord)
  );
}

function phrasesMatch(profilePhrase, jobPhrase) {
  const normalizedProfilePhrase = normalizePhrase(profilePhrase);
  const normalizedJobPhrase = normalizePhrase(jobPhrase);

  return (
    normalizedProfilePhrase === normalizedJobPhrase ||
    normalizedProfilePhrase.includes(normalizedJobPhrase) ||
    normalizedJobPhrase.includes(normalizedProfilePhrase)
  );
}

function matchJobTitleWithProfileTitle(jobTitle, profileTitle) {
  const jobTitleWords = getWords(jobTitle);
  const profileTitleWords = getWords(profileTitle);
  const matchedWords = profileTitleWords.filter((profileWord) =>
    jobTitleWords.some((jobWord) => wordsMatch(profileWord, jobWord))
  );

  return {
    isMatch: matchedWords.length >= 2,
    matchedWords
  };
}

function matchMatchedWordsWithProfileDescription(matchedTitleWords, profileDescription) {
  const profileDescriptionWords = getWords(profileDescription);
  const matchedWords = matchedTitleWords.filter((matchedTitleWord) =>
    profileDescriptionWords.some((descriptionWord) =>
      wordsMatch(descriptionWord, matchedTitleWord)
    )
  );

  return {
    isMatch: matchedTitleWords.length > 0 && matchedWords.length === matchedTitleWords.length,
    matchedWords
  };
}

function matchJobSkillsWithProfileSkills(jobSkills, profileSkills) {
  const matchedSkills = jobSkills.filter((jobSkill) =>
    profileSkills.some((profileSkill) => phrasesMatch(profileSkill, jobSkill))
  );
  const matchPercent = jobSkills.length === 0 ? 0 : matchedSkills.length / jobSkills.length;

  return {
    isMatch: jobSkills.length > 0 && matchPercent >= 0.4,
    matchedSkills,
    matchPercent
  };
}

function analyzeJobs(jobs) {
  return jobs.map((job) => {
    const titleMatch = matchJobTitleWithProfileTitle(job.title, freelancerProfile.title);
    const descriptionMatch = matchMatchedWordsWithProfileDescription(
      titleMatch.matchedWords,
      freelancerProfile.description
    );
    const skillsMatch = matchJobSkillsWithProfileSkills(job.skills, freelancerProfile.skills);

    return {
      ...job,
      titleMatch,
      descriptionMatch,
      skillsMatch,
      isBestMatchCandidate:
        titleMatch.isMatch && descriptionMatch.isMatch && skillsMatch.isMatch
    };
  });
}

function removeExistingMatchLabels(jobCard) {
  jobCard.querySelectorAll(".ujm-match-label").forEach((label) => label.remove());
  jobCard.style.backgroundColor = "";
  jobCard.style.border = "";
  jobCard.style.borderLeft = "";
  jobCard.style.borderRadius = "";
  jobCard.style.boxShadow = "";
}

function showJobStatus(job) {
  const label = document.createElement("div");
  label.className = "ujm-match-label";
  label.textContent = job.isBestMatchCandidate
    ? "Best Match Candidate"
    : "Not a Best Match";
  label.style.display = "inline-block";
  label.style.marginTop = "8px";
  label.style.padding = "4px 8px";
  label.style.fontSize = "13px";
  label.style.fontWeight = "700";
  label.style.borderRadius = "6px";

  if (job.isBestMatchCandidate) {
    label.style.color = "#108a00";
    label.style.backgroundColor = "#dcfce7";
    job.element.style.borderLeft = "4px solid #108a00";
    job.element.style.boxShadow = "inset 0 0 0 1px rgba(16, 138, 0, 0.35)";
  } else {
    label.style.color = "#b42318";
    label.style.backgroundColor = "#fee4e2";
    job.element.style.borderLeft = "4px solid #f04438";
    job.element.style.boxShadow = "inset 0 0 0 1px rgba(240, 68, 56, 0.35)";
  }

  job.element.style.borderRadius = "8px";
  job.titleElement.insertAdjacentElement("afterend", label);
}

function updateJobCards(analyzedJobs) {
  analyzedJobs.forEach((job) => {
    removeExistingMatchLabels(job.element);
    showJobStatus(job);
  });
}

function handleJobListings(jobCards) {
  const jobSignature = getJobSignature(jobCards);

  if (jobSignature === lastJobSignature) {
    return;
  }

  lastJobSignature = jobSignature;
  const jobs = extractJobs(jobCards);
  const analyzedJobs = analyzeJobs(jobs);
  updateJobCards(analyzedJobs);
  console.log(`Upwork Job Matcher: analyzed ${analyzedJobs.length} jobs.`, analyzedJobs);
}

function watchJobListingChanges() {
  const observer = new MutationObserver(async () => {
    const jobCards = await waitForJobListings();
    handleJobListings(jobCards);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function init() {
  try {
    freelancerProfile = await getFreelancerProfile();

    if (!freelancerProfile) {
      console.warn("Upwork Job Matcher: freelancer profile data is missing.");
      return;
    }

    console.log("Upwork Job Matcher: freelancer profile data found.", freelancerProfile);

    const jobCards = await waitForJobListings();
    handleJobListings(jobCards);
    watchJobListingChanges();
  } catch (error) {
    console.warn("Upwork Job Matcher:", error.message);
  }
}

init();
