const profileForm = document.querySelector("#profile-form");
const profileTitleInput = document.querySelector("#profile-title");
const profileDescriptionInput = document.querySelector("#profile-description");
const profileSkillsInput = document.querySelector("#profile-skills");
const statusMessage = document.querySelector("#status");
let saveTimeoutId;

function normalizeSkills(skillsText) {
  return skillsText
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

async function loadProfileData() {
  const data = await chrome.storage.local.get([
    "profileTitle",
    "profileDescription",
    "profileSkills"
  ]);

  profileTitleInput.value = data.profileTitle || "";
  profileDescriptionInput.value = data.profileDescription || "";
  profileSkillsInput.value = Array.isArray(data.profileSkills)
    ? data.profileSkills.join(", ")
    : "";
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfileData("Profile saved.");
});

async function saveProfileData(message) {
  clearTimeout(saveTimeoutId);

  await chrome.storage.local.set({
    profileTitle: profileTitleInput.value.trim(),
    profileDescription: profileDescriptionInput.value.trim(),
    profileSkills: normalizeSkills(profileSkillsInput.value)
  });

  statusMessage.textContent = message;
}

function scheduleAutoSave() {
  statusMessage.textContent = "Saving...";
  clearTimeout(saveTimeoutId);
  saveTimeoutId = setTimeout(() => {
    saveProfileData("Saved.");
  }, 300);
}

[profileTitleInput, profileDescriptionInput, profileSkillsInput].forEach((input) => {
  input.addEventListener("input", scheduleAutoSave);
});

loadProfileData();
