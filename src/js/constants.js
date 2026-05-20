export const WORK_SECS = ['lab', 'bio'];
export const HEARTH_SECS = ['hearth', 'scrolls', 'forge', 'bonds'];
export const ALL_SECTIONS = ['lab', 'bio', 'hearth', 'scrolls', 'forge', 'bonds'];

export const SECTION_NAMES = {
  lab: 'Lab Manager', bio: 'Bioinfo',
  hearth: 'Hearthkeeping', scrolls: 'Scrolls & Seals', forge: 'The Forge', bonds: 'Bonds & Oaths'
};

export const SECTION_COLORS = {
  lab: '#9b50e0', bio: '#3da855',
  hearth: '#9b50e0', scrolls: '#3da855', forge: '#2899bb', bonds: '#d08838'
};

// Keywords that signal urgency — auto-detected for priority scoring
export const URGENCY_KEYWORDS = [
  'urgent','asap','deadline','due','overdue','today','tonight','tomorrow',
  'critical','blocking','blocker','waiting','expired','last chance','final',
  'appointment','appt','meeting','interview','submission'
];

export const SEC_KEYWORDS = {
  hearth: ['clean','vacuum','laundry','dishes','trash','mop','organize','tidy','declutter','fix','repair','restock'],
  scrolls: ['appointment','appt','doctor','vet','dentist','tax','form','bill','insurance','renew','register','dmv','pay'],
  forge: ['hobby','read','book','workout','gym','run','walk','hike','trip','vacation','goal','learn','practice','class','cook','bake','garden'],
  bonds: ['call','text','email','reply','message','gift','birthday','date','payton','friend','family','mom','dad','sister','brother','visit'],
  lab: ['lab','experiment','order','inventory','protocol','meeting','pi','grant'],
  bio: ['pipeline','script','cluster','tscc','run','analysis','data','code','debug','snakemake','scenic','bioinfo','bioinformatics','genomics','sequencing','fastq','bam','vcf','alignment','rnaseq','scrnaseq','genome','conda','jupyter','python'],
};

export const RADAR_PROMPTS = [
  "when did you last deep-clean the kitchen?",
  "is the laundry under control?",
  "anything running low — toilet paper, soap, cat litter?",
  "are the cats due for anything? Nails, flea meds, vet check?",
  "is there a repair you keep walking past?",
  "when did you last take out all the recycling?",
  "any appointments you've been putting off? Doctor, dentist, vet?",
  "is there paperwork sitting in a pile somewhere?",
  "any subscriptions or bills to review?",
  "when did you last check your credit card statements?",
  "does the car need anything? Oil, registration, inspection?",
  "what's something you've been wanting to try?",
  "when did you last do something purely for fun?",
  "is there a hobby project gathering dust?",
  "have you moved your body today?",
  "what would make this week feel like a win for you?",
  "any books, shows, or games you've been meaning to get to?",
  "is there someone you've been meaning to reach out to?",
  "when did you last plan something fun with Payton?",
  "any birthdays or occasions coming up?",
  "does a friend or family member need something from you?",
  "when did you last call someone just to check in?",
  "is there a thank-you or apology you owe someone?",
];
