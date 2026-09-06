import assert from "node:assert"
import { describe, it } from "node:test"

import { buildReportModel } from "@/alignmentReportViewNew"
import {
  type AlignmentOverrides,
  type AlignmentReport,
} from "@/database/alignmentReports"
import { writeFile } from "node:fs/promises"

const report = {
  chapters: [
    {
      href: "introduction.xhtml",
      spineIndex: 6,
      chunk: 0,
      score: 88.72741891858297,
      transcriptionOffset: 2408,
      endTranscriptionOffset: 68291,
      firstMatchedSentenceId: 1,
      firstMatchedSentenceContext: {
        prevSentence: "INTRODUCTION\n",
        matchedSentence: "HARD CALLS AND EASY CALLS\n",
        nextSentence:
          "“MITIGATING THE RISK OF EXTINCTION FROM AI SHOULD BE A global priority alongside other societal-scale risks such as pandemics and nuclear war.”\n",
      },
      lastMatchedSentenceId: 185,
      lastMatchedSentenceContext: {
        prevSentence:
          "Human dignity, and humanity’s dignity, demands that we put up a fight.\n",
        matchedSentence: "Where there’s life, there’s hope.\n",
        nextSentence: "Footnotes\n",
      },
      chapterSentenceCount: 187,
      alignedSentenceCount: 168,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00003.mp4",
          start: 2.18,
          end: 1328.52,
        },
      ],
    },
    {
      href: "chapter001.xhtml",
      spineIndex: 8,
      chunk: 0,
      score: 89.58407219441153,
      transcriptionOffset: 69270,
      endTranscriptionOffset: 131659,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 1\n",
        nextSentence: "HUMANITY’S SPECIAL POWER\n",
      },
      lastMatchedSentenceId: 176,
      lastMatchedSentenceContext: {
        prevSentence:
          "But what if machine minds get better than us at the thing that, up until now, made us unique?\n",
        matchedSentence: "IfAnyoneBuildsIt.com/1\n",
        nextSentence: "Footnotes\n",
      },
      chapterSentenceCount: 178,
      alignedSentenceCount: 166,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00004.mp4",
          start: 0.08,
          end: 2.86,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00005.mp4",
          start: 5.96,
          end: 1258.36,
        },
      ],
    },
    {
      href: "chapter002.xhtml",
      spineIndex: 9,
      chunk: 0,
      score: 88.88640325179472,
      transcriptionOffset: 132171,
      endTranscriptionOffset: 209908,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 2\n",
        nextSentence: "GROWN, NOT CRAFTED\n",
      },
      lastMatchedSentenceId: 207,
      lastMatchedSentenceContext: {
        prevSentence: "That’s the issue we turn to next.\n",
        matchedSentence: "IfAnyoneBuildsIt.com/2\n",
        nextSentence: "Footnotes\n",
      },
      chapterSentenceCount: 209,
      alignedSentenceCount: 199,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00006.mp4",
          start: 0.08,
          end: 1551.94,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00007.mp4",
          start: 2.9,
          end: 8.02,
        },
      ],
    },
    {
      href: "chapter003.xhtml",
      spineIndex: 10,
      chunk: 0,
      score: 89.64492983847788,
      transcriptionOffset: 209933,
      endTranscriptionOffset: 263235,
      firstMatchedSentenceId: 4,
      firstMatchedSentenceContext: {
        prevSentence: "SAID THE Professor. ",
        matchedSentence:
          "“By cunningly configuring this mere machine—a simple arrangement of copper and sand, animated by tiny flickers of lightning—I have made it play chess!”\n",
        nextSentence: "“So what?” ",
      },
      lastMatchedSentenceId: 162,
      lastMatchedSentenceContext: {
        prevSentence:
          "No—we’re facing an even harder problem: It’s much easier to grow artificial intelligence that steers somewhere than it is to grow AIs that steer exactly where you want.\n",
        matchedSentence: "IfAnyoneBuildsIt.com/3\n",
        nextSentence: null,
      },
      chapterSentenceCount: 163,
      alignedSentenceCount: 157,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00007.mp4",
          start: 8.06,
          end: 1088.56,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00008.mp4",
          start: 4.0600000000000005,
          end: 10.14,
        },
      ],
    },
    {
      href: "chapter004.xhtml",
      spineIndex: 11,
      chunk: 0,
      score: 89.29984587526518,
      transcriptionOffset: 264390,
      endTranscriptionOffset: 379159,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 4\n",
        nextSentence: "YOU DON’T GET WHAT YOU TRAIN FOR\n",
      },
      lastMatchedSentenceId: 304,
      lastMatchedSentenceContext: {
        prevSentence:
          "Claude knew that it wasn’t supposed to cheat—otherwise it wouldn’t have tried to hide it. ",
        matchedSentence:
          "It cheated anyway, pursuing its own weird measure of success.\n",
        nextSentence: null,
      },
      chapterSentenceCount: 305,
      alignedSentenceCount: 270,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00007.mp4",
          start: 1084.4,
          end: 1087.76,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00008.mp4",
          start: 6.32,
          end: 2306.98,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00009.mp4",
          start: 2.48,
          end: 21.28,
        },
      ],
    },
    {
      href: "chapter005.xhtml",
      spineIndex: 12,
      chunk: 0,
      score: 89.28247643156465,
      transcriptionOffset: 379616,
      endTranscriptionOffset: 468508,
      firstMatchedSentenceId: 2,
      firstMatchedSentenceContext: {
        prevSentence: "ITS FAVORITE THINGS\n",
        matchedSentence:
          "THERE ONCE WAS a civilization of aliens, biological rather than mechanical in nature, and so far away from Earth that no message we sent into the stars could ever reach them. ",
        nextSentence:
          "They looked a bit like birds, thought a bit like humans, and cared quite a lot about the exact number of stones found in their nests.\n",
      },
      lastMatchedSentenceId: 223,
      lastMatchedSentenceContext: {
        prevSentence: "IfAnyoneBuildsIt.com/5\n",
        matchedSentence: "Footnote\n",
        nextSentence: null,
      },
      chapterSentenceCount: 224,
      alignedSentenceCount: 220,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00009.mp4",
          start: 2.54,
          end: 1770.02,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00010.mp4",
          start: 5.22,
          end: 10.66,
        },
      ],
    },
    {
      href: "chapter006.xhtml",
      spineIndex: 13,
      chunk: 0,
      score: 89.69357910221929,
      transcriptionOffset: 468570,
      endTranscriptionOffset: 582356,
      firstMatchedSentenceId: 1,
      firstMatchedSentenceContext: {
        prevSentence: "CHAPTER 6\n",
        matchedSentence: "WE’D LOSE\n",
        nextSentence:
          "IMAGINE BEING AN Aztec warrior visiting the coast with your fellows, watching the first Spanish boats approach your shore. ",
      },
      lastMatchedSentenceId: 303,
      lastMatchedSentenceContext: {
        prevSentence: "IfAnyoneBuildsIt.com/6\n",
        matchedSentence: "Footnotes\n",
        nextSentence: null,
      },
      chapterSentenceCount: 304,
      alignedSentenceCount: 292,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00010.mp4",
          start: 9.18,
          end: 2256.92,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00012.mp4",
          start: 9.08,
          end: 17.06,
        },
      ],
    },
    {
      href: "chapter007.xhtml",
      spineIndex: 15,
      chunk: 0,
      score: 88.69963658250549,
      transcriptionOffset: 582705,
      endTranscriptionOffset: 654444,
      firstMatchedSentenceId: 10,
      firstMatchedSentenceContext: {
        prevSentence:
          "Compared to previous reasoning models, like the first ones announced in late 2024 (e.g., OpenAI’s o1 and o3 models), Sable has three important differences.\n",
        matchedSentence:
          "The first difference is that Sable has a more humanlike long-term memory; it can learn, and remember what it has learned.\n",
        nextSentence:
          "The second difference is that Sable exhibits what Galvanic’s scientists call a “parallel scaling law.” ",
      },
      lastMatchedSentenceId: 184,
      lastMatchedSentenceContext: {
        prevSentence: "What comes next will require more skill.\n",
        matchedSentence: "Footnotes\n",
        nextSentence: null,
      },
      chapterSentenceCount: 185,
      alignedSentenceCount: 168,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00012.mp4",
          start: 22.42,
          end: 1458.86,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00013.mp4",
          start: 5.74,
          end: 7.6000000000000005,
        },
      ],
    },
    {
      href: "chapter008.xhtml",
      spineIndex: 16,
      chunk: 0,
      score: 89.96254029346169,
      transcriptionOffset: 655066,
      endTranscriptionOffset: 756630,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 8\n",
        nextSentence: "EXPANSION\n",
      },
      lastMatchedSentenceId: 289,
      lastMatchedSentenceContext: {
        prevSentence:
          "As long as there’s electricity for the datacenters, and the robot factories are humming, humanity can keep its civilization going despite the incalculable casualties it’s endured. ",
        matchedSentence:
          "We can pull through, and the next generation will surely live in great luxury.\n",
        nextSentence: "Another year passes.\n",
      },
      chapterSentenceCount: 292,
      alignedSentenceCount: 288,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00012.mp4",
          start: 1459.26,
          end: 1461.92,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00013.mp4",
          start: 4.7,
          end: 2038.1,
        },
      ],
    },
    {
      href: "chapter009.xhtml",
      spineIndex: 17,
      chunk: 0,
      score: 89.17144179597346,
      transcriptionOffset: 757580,
      endTranscriptionOffset: 788445,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 9\n",
        nextSentence: "ASCENSION\n",
      },
      lastMatchedSentenceId: 80,
      lastMatchedSentenceContext: {
        prevSentence:
          "They would know, considering the cases like Earth as a possibility, that most humans meant them no harm; that most of us didn’t mean to waste all those stars; that our poor choices killed us too, and weren’t deliberate or intentional. ",
        matchedSentence:
          "But nonetheless, they will wish that Earth and human beings had never been.\n",
        nextSentence: null,
      },
      chapterSentenceCount: 81,
      alignedSentenceCount: 80,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00013.mp4",
          start: 2043.66,
          end: 2046.56,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00014.mp4",
          start: 6.84,
          end: 618.68,
        },
      ],
    },
    {
      href: "chapter010.xhtml",
      spineIndex: 18,
      chunk: 0,
      score: 87.6211506088415,
      transcriptionOffset: 788450,
      endTranscriptionOffset: 795006,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CODA\n",
        nextSentence: "THE PICTURE WE HAVE JUST PAINTED IS NOT REAL. ",
      },
      lastMatchedSentenceId: 17,
      lastMatchedSentenceContext: {
        prevSentence:
          "So we’ll also ask what it would truly take to prevent all of the different ways a story like Sable’s could start in the first place—not just imagining a way that one AI company or one AI design could temporarily avoid firing the starting shot, but asking how to prevent it from happening all over the Earth for a long time.\n",
        matchedSentence: "IfAnyoneBuildsIt.com/ii\n",
        nextSentence: null,
      },
      chapterSentenceCount: 18,
      alignedSentenceCount: 17,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00015.mp4",
          start: 6.48,
          end: 136.44,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00016.mp4",
          start: 1.34,
          end: 3.62,
        },
      ],
    },
    {
      href: "chapter011.xhtml",
      spineIndex: 20,
      chunk: 0,
      score: 88.83953127666956,
      transcriptionOffset: 795146,
      endTranscriptionOffset: 877072,
      firstMatchedSentenceId: 2,
      firstMatchedSentenceContext: {
        prevSentence: "A CURSED PROBLEM\n",
        matchedSentence:
          "THE GREATEST AND MOST CENTRAL DIFFICULTY IN ALIGNING artificial superintelligence is navigating the gap between before and after.\n",
        nextSentence:
          "Before, the AI is not powerful enough to kill us all, nor capable enough to resist our attempts to change its goals. ",
      },
      lastMatchedSentenceId: 243,
      lastMatchedSentenceContext: {
        prevSentence: "It isn’t close.\n",
        matchedSentence:
          "Attempting to solve a problem like that, with the lives of everyone on Earth at stake, would be an insane and stupid gamble that NOBODY SHOULD BE ALLOWED TO TRY.\n",
        nextSentence: "IfAnyoneBuildsIt.com/10\n",
      },
      chapterSentenceCount: 246,
      alignedSentenceCount: 203,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00016.mp4",
          start: 3.62,
          end: 6.023125,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00017.mp4",
          start: 15.9,
          end: 1637.94,
        },
      ],
    },
    {
      href: "chapter012.xhtml",
      spineIndex: 21,
      chunk: 0,
      score: 89.51962160883343,
      transcriptionOffset: 877563,
      endTranscriptionOffset: 957955,
      firstMatchedSentenceId: 1,
      firstMatchedSentenceContext: {
        prevSentence: "CHAPTER 11\n",
        matchedSentence: "AN ALCHEMY, NOT A SCIENCE\n",
        nextSentence:
          "ONCE UPON A TIME that never was, there was a medieval town that prided itself upon the prowess of its alchemists.\n",
      },
      lastMatchedSentenceId: 241,
      lastMatchedSentenceContext: {
        prevSentence: "IfAnyoneBuildsIt.com/11\n",
        matchedSentence: "Footnotes\n",
        nextSentence: null,
      },
      chapterSentenceCount: 242,
      alignedSentenceCount: 229,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00018.mp4",
          start: 2.1,
          end: 1605.62,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00019.mp4",
          start: 2.64,
          end: 8.32,
        },
      ],
    },
    {
      href: "chapter013.xhtml",
      spineIndex: 22,
      chunk: 0,
      score: 88.89026449481159,
      transcriptionOffset: 957956,
      endTranscriptionOffset: 1023576,
      firstMatchedSentenceId: 2,
      firstMatchedSentenceContext: {
        prevSentence: "“I DON’T WANT TO BE ALARMIST”\n",
        matchedSentence:
          "ONCE UPON A TIME—specifically May 18, 1889, for this is a true story—Thomas Midgley Jr. ",
        nextSentence: "was born. ",
      },
      lastMatchedSentenceId: 179,
      lastMatchedSentenceContext: {
        prevSentence: "IfAnyoneBuildsIt.com/12\n",
        matchedSentence: "Footnote\n",
        nextSentence: null,
      },
      chapterSentenceCount: 180,
      alignedSentenceCount: 173,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00019.mp4",
          start: 7.1000000000000005,
          end: 1308.64,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00020.mp4",
          start: 2.94,
          end: 9,
        },
      ],
    },
    {
      href: "chapter014.xhtml",
      spineIndex: 23,
      chunk: 0,
      score: 86.59582790528411,
      transcriptionOffset: 1023664,
      endTranscriptionOffset: 1074736,
      firstMatchedSentenceId: 3,
      firstMatchedSentenceContext: {
        prevSentence: "THIS PARABLE, LIKE the last one, really happened.\n",
        matchedSentence:
          "Once upon a time, sometimes dated from 1939 to 1945, the Axis Powers sent armies across Europe, North Africa, Asia, and the Pacific, making a play for totalitarianism to conquer most of the world, and maybe eventually all of it. ",
        nextSentence:
          "It would not have been the end of humanity, to leave the Axis unopposed, but it would have been the end of free humanity.\n",
      },
      lastMatchedSentenceId: 161,
      lastMatchedSentenceContext: {
        prevSentence:
          "But nearly all of us can agree that humanity should not go extinct and be replaced by something bleak.\n",
        matchedSentence:
          "If we can all cooperate to ensure that one thing doesn’t happen, regardless of our other beliefs and other positions, then humanity might just stand a chance.\n",
        nextSentence: "IfAnyoneBuildsIt.com/13\n",
      },
      chapterSentenceCount: 164,
      alignedSentenceCount: 134,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00020.mp4",
          start: 9.98,
          end: 1032.74,
        },
      ],
    },
    {
      href: "chapter015.xhtml",
      spineIndex: 24,
      chunk: 0,
      score: 88.06121033981206,
      transcriptionOffset: 1075249,
      endTranscriptionOffset: 1127680,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CHAPTER 14\n",
        nextSentence: "WHERE THERE’S LIFE, THERE’S HOPE\n",
      },
      lastMatchedSentenceId: 163,
      lastMatchedSentenceContext: {
        prevSentence:
          "Wouldn’t it be silly if really almost none of the decision-makers wanted to die of this, but they all thought they were alone in thinking so?\n",
        matchedSentence: "Where there’s life, there’s hope.\n",
        nextSentence: "Footnotes\n",
      },
      chapterSentenceCount: 165,
      alignedSentenceCount: 155,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00020.mp4",
          start: 1032.78,
          end: 1035.86,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00021.mp4",
          start: 2.62,
          end: 1061.02,
        },
      ],
    },
    {
      href: "appendix001.xhtml",
      spineIndex: 25,
      chunk: 0,
      score: 89.80027397800895,
      transcriptionOffset: 1127795,
      endTranscriptionOffset: 1130277,
      firstMatchedSentenceId: 0,
      firstMatchedSentenceContext: {
        prevSentence: null,
        matchedSentence: "CLOSING WORDS\n",
        nextSentence:
          "From time to time, people have asked us if we’ve felt vindicated to see our past predictions coming true or to see more attention getting paid to us and this issue.\n",
      },
      lastMatchedSentenceId: 6,
      lastMatchedSentenceContext: {
        prevSentence: "So our true last prayer is this:\n",
        matchedSentence: "Rise to the occasion, humanity, and win.\n",
        nextSentence: null,
      },
      chapterSentenceCount: 7,
      alignedSentenceCount: 7,
      audioFiles: [
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00021.mp4",
          start: 1056.64,
          end: 1064.18,
        },
        {
          filepath:
            "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00022.mp4",
          start: 13.82,
          end: 44.379999999999995,
        },
      ],
    },
  ],
  unalignedChapters: [
    {
      href: "cover.xhtml",
      reason: "no-text",
    },
    {
      href: "titlepage.xhtml",
      reason: "no-text",
    },
    {
      href: "copyright.xhtml",
      reason: "not-found",
      spineIndex: 2,
      score: 0,
      chapterSentenceCount: 27,
      start:
        "Copyright © 2025 by Eliezer Yudkowsky and Nate Soares\nCover design by Gregg Kuli",
      end: "67 (ebook)\nLibrary of Congress Control Number: 2025938106\nE3-20250820-JV-NF-ORI\n",
    },
    {
      href: "toc.xhtml",
      reason: "is-nav",
    },
    {
      href: "dedication.xhtml",
      reason: "not-found",
      spineIndex: 4,
      score: 0,
      chapterSentenceCount: 3,
      start:
        "To all the humans who ever died, in the process of our species coming this far;\n",
      end: " who are still among the living;\nAnd to all the children that could someday be.\n",
    },
    {
      href: "discover-page_pre.xhtml",
      reason: "not-found",
      spineIndex: 5,
      score: 0,
      chapterSentenceCount: 2,
      start:
        "Explore book giveaways, sneak peeks, deals, and more.\nTap here to learn more.\n",
      end: "Explore book giveaways, sneak peeks, deals, and more.\nTap here to learn more.\n",
    },
    {
      href: "part001.xhtml",
      reason: "not-found",
      spineIndex: 7,
      score: 0,
      chapterSentenceCount: 2,
      start: "PART I\nNONHUMAN MINDS\n",
      end: "PART I\nNONHUMAN MINDS\n",
    },
    {
      href: "part002.xhtml",
      reason: "not-found",
      spineIndex: 14,
      score: 0,
      chapterSentenceCount: 2,
      start: "PART II\nONE EXTINCTION SCENARIO\n",
      end: "PART II\nONE EXTINCTION SCENARIO\n",
    },
    {
      href: "part003.xhtml",
      reason: "not-found",
      spineIndex: 19,
      score: 0,
      chapterSentenceCount: 2,
      start: "PART III\nFACING THE CHALLENGE\n",
      end: "PART III\nFACING THE CHALLENGE\n",
    },
    {
      href: "acknowledgements.xhtml",
      reason: "not-found",
      spineIndex: 26,
      score: 0,
      chapterSentenceCount: 9,
      start:
        "ACKNOWLEDGMENTS\nWith gratitude to:\nAella and Gretta, the book widows and midwive",
      end: ", for long days and late nights of editing; and many others.\nIt took a village.\n",
    },
    {
      href: "discover-page.xhtml",
      reason: "not-found",
      spineIndex: 27,
      score: 0,
      chapterSentenceCount: 3,
      start:
        "Discover Your Next Great Read\nGet sneak peeks, book recommendations, and news ab",
      end: " recommendations, and news about your favorite authors.\nTap here to learn more.\n",
    },
    {
      href: "personblurb.xhtml",
      reason: "not-found",
      spineIndex: 28,
      score: 0,
      chapterSentenceCount: 8,
      start:
        "ABOUT THE AUTHORS\nELIEZER YUDKOWSKY is one of the founding researchers of the fi",
      end: "rning, decision theory, and power-seeking incentives in smarter-than-human AIs.\n",
    },
    {
      href: "appendix003.xhtml",
      reason: "not-found",
      spineIndex: 29,
      score: 0,
      chapterSentenceCount: 302,
      start:
        "NOTES\nINTRODUCTION: HARD CALLS AND EASY CALLS\n1. back to normal: Elie Wiesel, Ni",
      end: "ipi.org.\nSee the toplines and crosstabs linked in the “About the Poll” section.\n",
    },
    {
      href: "praise.xhtml",
      reason: "not-found",
      spineIndex: 30,
      score: 0,
      chapterSentenceCount: 75,
      start:
        "Praise for If Anyone Builds It, Everyone Dies\n“If Anyone Builds It, Everyone Die",
      end: "nation of the AI risk problem I’ve ever read.”\n—Yishan Wong, former CEO, Reddit\n",
    },
  ],
  audioFiles: [
    {
      alignedDuration: 1326.34,
      duration: 1328.52,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00003.mp4",
      matchedRanges: [
        {
          start: 2.18,
          end: 1328.52,
        },
      ],
    },
    {
      alignedDuration: 2.78,
      duration: 6.017,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00004.mp4",
      matchedRanges: [
        {
          start: 0.08,
          end: 2.86,
        },
      ],
    },
    {
      alignedDuration: 1252.3999999999999,
      duration: 1258.36,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00005.mp4",
      matchedRanges: [
        {
          start: 5.96,
          end: 1258.36,
        },
      ],
    },
    {
      alignedDuration: 1551.8600000000001,
      duration: 1555.08,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00006.mp4",
      matchedRanges: [
        {
          start: 0.08,
          end: 1551.94,
        },
      ],
    },
    {
      alignedDuration: 1088.9799999999998,
      duration: 1091.7,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00007.mp4",
      matchedRanges: [
        {
          start: 2.9,
          end: 8.02,
        },
        {
          start: 8.06,
          end: 1088.56,
        },
        {
          start: 1084.4,
          end: 1087.76,
        },
      ],
    },
    {
      alignedDuration: 2306.74,
      duration: 2310.14,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00008.mp4",
      matchedRanges: [
        {
          start: 4.0600000000000005,
          end: 10.14,
        },
        {
          start: 6.32,
          end: 2306.98,
        },
      ],
    },
    {
      alignedDuration: 1786.28,
      duration: 1773.14,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00009.mp4",
      matchedRanges: [
        {
          start: 2.48,
          end: 21.28,
        },
        {
          start: 2.54,
          end: 1770.02,
        },
      ],
    },
    {
      alignedDuration: 2253.1800000000003,
      duration: 2265.96,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00010.mp4",
      matchedRanges: [
        {
          start: 5.22,
          end: 10.66,
        },
        {
          start: 9.18,
          end: 2256.92,
        },
      ],
    },
    {
      alignedDuration: 1447.08,
      duration: 1466.1,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00012.mp4",
      matchedRanges: [
        {
          start: 9.08,
          end: 17.06,
        },
        {
          start: 22.42,
          end: 1458.86,
        },
        {
          start: 1459.26,
          end: 1461.92,
        },
      ],
    },
    {
      alignedDuration: 2038.1599999999996,
      duration: 2049.76,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00013.mp4",
      matchedRanges: [
        {
          start: 4.7,
          end: 2038.1,
        },
        {
          start: 5.74,
          end: 7.6000000000000005,
        },
        {
          start: 2043.66,
          end: 2046.56,
        },
      ],
    },
    {
      alignedDuration: 611.8399999999999,
      duration: 618.68,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00014.mp4",
      matchedRanges: [
        {
          start: 6.84,
          end: 618.68,
        },
      ],
    },
    {
      alignedDuration: 129.96,
      duration: 136.44,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00015.mp4",
      matchedRanges: [
        {
          start: 6.48,
          end: 136.44,
        },
      ],
    },
    {
      alignedDuration: 4.683125,
      duration: 6.023125,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00016.mp4",
      matchedRanges: [
        {
          start: 1.34,
          end: 3.62,
        },
        {
          start: 3.62,
          end: 6.023125,
        },
      ],
    },
    {
      alignedDuration: 1622.04,
      duration: 1641.08,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00017.mp4",
      matchedRanges: [
        {
          start: 15.9,
          end: 1637.94,
        },
      ],
    },
    {
      alignedDuration: 1603.52,
      duration: 1608.74,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00018.mp4",
      matchedRanges: [
        {
          start: 2.1,
          end: 1605.62,
        },
      ],
    },
    {
      alignedDuration: 1307.2200000000003,
      duration: 1311.8,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00019.mp4",
      matchedRanges: [
        {
          start: 2.64,
          end: 8.32,
        },
        {
          start: 7.1000000000000005,
          end: 1308.64,
        },
      ],
    },
    {
      alignedDuration: 1031.8999999999999,
      duration: 1035.86,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00020.mp4",
      matchedRanges: [
        {
          start: 2.94,
          end: 9,
        },
        {
          start: 9.98,
          end: 1032.74,
        },
        {
          start: 1032.78,
          end: 1035.86,
        },
      ],
    },
    {
      alignedDuration: 1065.94,
      duration: 1064.18,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00021.mp4",
      matchedRanges: [
        {
          start: 2.62,
          end: 1061.02,
        },
        {
          start: 1056.64,
          end: 1064.18,
        },
      ],
    },
    {
      alignedDuration: 30.559999999999995,
      duration: 47.620000000000005,
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00022.mp4",
      matchedRanges: [
        {
          start: 13.82,
          end: 44.379999999999995,
        },
      ],
    },
  ],
  unalignedAudioFiles: [
    {
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00001.mp4",
      duration: 29.98,
    },
    {
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00002.mp4",
      duration: 15.5363125,
    },
    {
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00011.mp4",
      duration: 6.0205625,
    },
    {
      filepath:
        "/Users/thomas/Projects/storyteller/dev-data/assets/If Anyone Builds It, Everyone Dies [AZQviNw5]/transcoded audio/00001-00023.mp4",
      duration: 60.78,
    },
  ],
} satisfies AlignmentReport

void describe("alignmentReportView", () => {
  void it("", () => {
    const model = buildReportModel({ report })

    console.log(model)
  })

  void it("ratio of aligned audio to total audio", (ctx) => {
    const {
      summary: { audioPlacedSeconds, audioTotalSeconds },
    } = buildReportModel({ report })

    const ratio = audioPlacedSeconds / audioTotalSeconds
    ctx.assert.ok(
      ratio > 0.9,
      "ratio of aligned audio to total audio is less than 0.9",
    )
  })

  void it("ratio of aligned sentences to total sentences", (ctx) => {
    const {
      summary: { sentencesAligned, sentencesTotal },
    } = buildReportModel({ report })

    const ratio = sentencesAligned / sentencesTotal
    console.log(ratio, sentencesAligned, sentencesTotal)
    ctx.assert.ok(
      ratio > 0.7,
      "ratio of aligned sentences to total sentences is less than 0.9",
    )
  })
})
const manifest = {
  "@context": "https://readium.org/webpub-manifest/context.jsonld",
  landmarks: [
    { href: "OEBPS/cover.xhtml", title: "Begin Reading" },
    { href: "OEBPS/toc.xhtml", title: "Table of Contents" },
  ],
  links: [
    {
      href: "~readium/positions.json",
      type: "application/vnd.readium.position-list+json",
    },
    {
      href: "~readium/content.json",
      type: "application/vnd.readium.content+json",
    },
    {
      href: "~readium/guided-navigation.json{?ref}",
      templated: true,
      type: "application/guided-navigation+json",
    },
    {
      href: "http://localhost:8002/webpub/VXNlcnMvdGhvbWFzL1Byb2plY3RzL3N0b3J5dGVsbGVyL2Rldi1kYXRhL2Fzc2V0cy9JZiBBbnlvbmUgQnVpbGRzIEl0LCBFdmVyeW9uZSBEaWVzIFtBWlF2aU53NV0vYWxpZ25lZC9JZiBBbnlvbmUgQnVpbGRzIEl0LCBFdmVyeW9uZSBEaWVzLmVwdWI/manifest.json",
      rel: "self",
      type: "application/webpub+json",
    },
  ],
  metadata: {
    accessibility: {
      summary:
        "This publication conforms to the EPUB Accessibility specification at WCAG 2.0 Level AA.",
      accessMode: ["textual", "visual"],
      accessModeSufficient: [["visual"], ["textual"]],
      feature: ["structuralNavigation", "alternativeText"],
      hazard: ["none"],
    },
    altIdentifier: [
      "hardcover-book-id:1940689",
      "hardcover-book-slug:if-anyone-builds-it-everyone-dies",
    ],
    author: [
      { name: "Eliezer Yudkowsky", sortAs: "Eliezer Yudkowsky" },
      { name: "Nate Soares", sortAs: "Nate Soares" },
      { name: "Rafe Beckley", sortAs: "Rafe Beckley" },
    ],
    conformsTo: "https://readium.org/webpub-manifest/profiles/epub",
    description:
      "\u003cB\u003eThe scramble to create superhuman AI has put us on the path to extinction\u0026mdash;but it\u0026rsquo;s not too late to change course, as two of the field\u0026rsquo;s earliest researchers explain in this clarion call for humanity.\u003cBR /\u003e \u0026quot;May prove to be the most important book of our time.\u0026rdquo;\u0026mdash;Tim Urban, \u003cI\u003eWait But Why\u003c/I\u003e\u003c/B\u003e\u003cBR /\u003e In 2023, hundreds of AI luminaries signed an open letter warning that artificial intelligence poses a serious risk of human extinction. Since then, the AI race has only intensified. Companies and countries are rushing to build machines that will be smarter than any person. And the world is devastatingly unprepared for what would come next.\u003cBR /\u003e \u0026#160;\u003cBR /\u003e For decades, two signatories of that letter\u0026mdash;Eliezer Yudkowsky and Nate Soares\u0026mdash;have studied how smarter-than-human intelligences will think, behave, and pursue their objectives. Their research says that sufficiently smart AIs will develop goals of their own that put them in conflict...",
    duration: 22575.2,
    "http://purl.org/dc/terms/rights":
      "Copyright © 2025 by Eliezer Yudkowsky and Nate Soares",
    "http://purl.org/dc/terms/source": {
      "@value": "urn:isbn:9780316595667",
      "http://idpf.org/epub/vocab/package/meta/#source-of": "pagination",
    },
    "http://purl.org/dc/terms/subject": ["Computers", "Science Fiction"],
    "http://vocabulary.itunes.apple.com/rdf/ibooks/vocabulary-extensions-1.0/specified-fonts":
      "true",
    "http://www.idpf.org/2007/opf#version": "3.0",
    "https://github.com/readium/go-toolkit#version": "v0.13.3",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary#media-overlays-modified":
      "Fri Sep 04 2026 18:33:59 GMT+0200 (Central European Summer Time)",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary#media-overlays-transcription-engine":
      "wav2vec-local",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary#version":
      "2.14.21",
    identifier: "9780316595667",
    language: "en-US",
    mediaOverlay: { activeClass: "-epub-media-overlay-active" },
    modified: "2026-09-04T16:34:00Z",
    published: "2025-01-01T00:00:00Z",
    publisher: "Little, Brown and Company",
    readingProgression: "ltr",
    subject: ["Computers", "Science Fiction"],
    subtitle: "Why Superhuman AI Would Kill Us All",
    title: "If Anyone Builds It, Everyone Dies",
  },
  pageList: [
    { href: "OEBPS/copyright.xhtml#pageviii", title: "viii" },
    { href: "OEBPS/toc.xhtml#pagexi", title: "xi" },
    { href: "OEBPS/toc.xhtml#pagexii", title: "xii" },
    { href: "OEBPS/dedication.xhtml#pageix", title: "ix" },
    { href: "OEBPS/introduction.xhtml#page4", title: "4" },
    { href: "OEBPS/introduction.xhtml#page5", title: "5" },
    { href: "OEBPS/introduction.xhtml#page6", title: "6" },
    { href: "OEBPS/introduction.xhtml#page7", title: "7" },
    { href: "OEBPS/introduction.xhtml#page8", title: "8" },
    { href: "OEBPS/introduction.xhtml#page9", title: "9" },
    { href: "OEBPS/introduction.xhtml#page10", title: "10" },
    { href: "OEBPS/introduction.xhtml#page11", title: "11" },
    { href: "OEBPS/introduction.xhtml#page12", title: "12" },
    { href: "OEBPS/introduction.xhtml#page13", title: "13" },
    { href: "OEBPS/introduction.xhtml#page14", title: "14" },
    { href: "OEBPS/part001.xhtml#page15", title: "15" },
    { href: "OEBPS/chapter001.xhtml#page17", title: "17" },
    { href: "OEBPS/chapter001.xhtml#page18", title: "18" },
    { href: "OEBPS/chapter001.xhtml#page19", title: "19" },
    { href: "OEBPS/chapter001.xhtml#page20", title: "20" },
    { href: "OEBPS/chapter001.xhtml#page21", title: "21" },
    { href: "OEBPS/chapter001.xhtml#page22", title: "22" },
    { href: "OEBPS/chapter001.xhtml#page23", title: "23" },
    { href: "OEBPS/chapter001.xhtml#page24", title: "24" },
    { href: "OEBPS/chapter001.xhtml#page25", title: "25" },
    { href: "OEBPS/chapter001.xhtml#page26", title: "26" },
    { href: "OEBPS/chapter001.xhtml#page27", title: "27" },
    { href: "OEBPS/chapter001.xhtml#page29", title: "29" },
    { href: "OEBPS/chapter002.xhtml#page30", title: "30" },
    { href: "OEBPS/chapter002.xhtml#page31", title: "31" },
    { href: "OEBPS/chapter002.xhtml#page32", title: "32" },
    { href: "OEBPS/chapter002.xhtml#page33", title: "33" },
    { href: "OEBPS/chapter002.xhtml#page34", title: "34" },
    { href: "OEBPS/chapter002.xhtml#page35", title: "35" },
    { href: "OEBPS/chapter002.xhtml#page36", title: "36" },
    { href: "OEBPS/chapter002.xhtml#page37", title: "37" },
    { href: "OEBPS/chapter002.xhtml#page38", title: "38" },
    { href: "OEBPS/chapter002.xhtml#page39", title: "39" },
    { href: "OEBPS/chapter002.xhtml#page40", title: "40" },
    { href: "OEBPS/chapter002.xhtml#page41", title: "41" },
    { href: "OEBPS/chapter002.xhtml#page42", title: "42" },
    { href: "OEBPS/chapter002.xhtml#page43", title: "43" },
    { href: "OEBPS/chapter002.xhtml#page44", title: "44" },
    { href: "OEBPS/chapter002.xhtml#page45", title: "45" },
    { href: "OEBPS/chapter003.xhtml#page46", title: "46" },
    { href: "OEBPS/chapter003.xhtml#page47", title: "47" },
    { href: "OEBPS/chapter003.xhtml#page48", title: "48" },
    { href: "OEBPS/chapter003.xhtml#page49", title: "49" },
    { href: "OEBPS/chapter003.xhtml#page50", title: "50" },
    { href: "OEBPS/chapter003.xhtml#page51", title: "51" },
    { href: "OEBPS/chapter003.xhtml#page52", title: "52" },
    { href: "OEBPS/chapter003.xhtml#page53", title: "53" },
    { href: "OEBPS/chapter003.xhtml#page54", title: "54" },
    { href: "OEBPS/chapter004.xhtml#page56", title: "56" },
    { href: "OEBPS/chapter004.xhtml#page57", title: "57" },
    { href: "OEBPS/chapter004.xhtml#page58", title: "58" },
    { href: "OEBPS/chapter004.xhtml#page59", title: "59" },
    { href: "OEBPS/chapter004.xhtml#page60", title: "60" },
    { href: "OEBPS/chapter004.xhtml#page61", title: "61" },
    { href: "OEBPS/chapter004.xhtml#page62", title: "62" },
    { href: "OEBPS/chapter004.xhtml#page63", title: "63" },
    { href: "OEBPS/chapter004.xhtml#page64", title: "64" },
    { href: "OEBPS/chapter004.xhtml#page65", title: "65" },
    { href: "OEBPS/chapter004.xhtml#page66", title: "66" },
    { href: "OEBPS/chapter004.xhtml#page67", title: "67" },
    { href: "OEBPS/chapter004.xhtml#page68", title: "68" },
    { href: "OEBPS/chapter004.xhtml#page69", title: "69" },
    { href: "OEBPS/chapter004.xhtml#page70", title: "70" },
    { href: "OEBPS/chapter004.xhtml#page71", title: "71" },
    { href: "OEBPS/chapter004.xhtml#page72", title: "72" },
    { href: "OEBPS/chapter004.xhtml#page73", title: "73" },
    { href: "OEBPS/chapter004.xhtml#page74", title: "74" },
    { href: "OEBPS/chapter004.xhtml#page75", title: "75" },
    { href: "OEBPS/chapter004.xhtml#page76", title: "76" },
    { href: "OEBPS/chapter005.xhtml#page78", title: "78" },
    { href: "OEBPS/chapter005.xhtml#page79", title: "79" },
    { href: "OEBPS/chapter005.xhtml#page80", title: "80" },
    { href: "OEBPS/chapter005.xhtml#page81", title: "81" },
    { href: "OEBPS/chapter005.xhtml#page82", title: "82" },
    { href: "OEBPS/chapter005.xhtml#page83", title: "83" },
    { href: "OEBPS/chapter005.xhtml#page84", title: "84" },
    { href: "OEBPS/chapter005.xhtml#page85", title: "85" },
    { href: "OEBPS/chapter005.xhtml#page86", title: "86" },
    { href: "OEBPS/chapter005.xhtml#page87", title: "87" },
    { href: "OEBPS/chapter005.xhtml#page88", title: "88" },
    { href: "OEBPS/chapter005.xhtml#page89", title: "89" },
    { href: "OEBPS/chapter005.xhtml#page90", title: "90" },
    { href: "OEBPS/chapter005.xhtml#page91", title: "91" },
    { href: "OEBPS/chapter005.xhtml#page92", title: "92" },
    { href: "OEBPS/chapter006.xhtml#page94", title: "94" },
    { href: "OEBPS/chapter006.xhtml#page95", title: "95" },
    { href: "OEBPS/chapter006.xhtml#page96", title: "96" },
    { href: "OEBPS/chapter006.xhtml#page97", title: "97" },
    { href: "OEBPS/chapter006.xhtml#page98", title: "98" },
    { href: "OEBPS/chapter006.xhtml#page99", title: "99" },
    { href: "OEBPS/chapter006.xhtml#page100", title: "100" },
    { href: "OEBPS/chapter006.xhtml#page101", title: "101" },
    { href: "OEBPS/chapter006.xhtml#page102", title: "102" },
    { href: "OEBPS/chapter006.xhtml#page103", title: "103" },
    { href: "OEBPS/chapter006.xhtml#page104", title: "104" },
    { href: "OEBPS/chapter006.xhtml#page105", title: "105" },
    { href: "OEBPS/chapter006.xhtml#page106", title: "106" },
    { href: "OEBPS/chapter006.xhtml#page107", title: "107" },
    { href: "OEBPS/chapter006.xhtml#page108", title: "108" },
    { href: "OEBPS/chapter006.xhtml#page109", title: "109" },
    { href: "OEBPS/chapter006.xhtml#page110", title: "110" },
    { href: "OEBPS/chapter006.xhtml#page111", title: "111" },
    { href: "OEBPS/chapter006.xhtml#page112", title: "112" },
    { href: "OEBPS/chapter006.xhtml#page113", title: "113" },
    { href: "OEBPS/chapter006.xhtml#page114", title: "114" },
    { href: "OEBPS/part002.xhtml#page115", title: "115" },
    { href: "OEBPS/chapter007.xhtml#page116", title: "116" },
    { href: "OEBPS/chapter007.xhtml#page117", title: "117" },
    { href: "OEBPS/chapter007.xhtml#page120", title: "120" },
    { href: "OEBPS/chapter007.xhtml#page118", title: "118" },
    { href: "OEBPS/chapter007.xhtml#page119", title: "119" },
    { href: "OEBPS/chapter007.xhtml#page121", title: "121" },
    { href: "OEBPS/chapter007.xhtml#page122", title: "122" },
    { href: "OEBPS/chapter007.xhtml#page123", title: "123" },
    { href: "OEBPS/chapter007.xhtml#page124", title: "124" },
    { href: "OEBPS/chapter007.xhtml#page125", title: "125" },
    { href: "OEBPS/chapter007.xhtml#page126", title: "126" },
    { href: "OEBPS/chapter007.xhtml#page127", title: "127" },
    { href: "OEBPS/chapter007.xhtml#page128", title: "128" },
    { href: "OEBPS/chapter007.xhtml#page129", title: "129" },
    { href: "OEBPS/chapter007.xhtml#page130", title: "130" },
    { href: "OEBPS/chapter007.xhtml#page131", title: "131" },
    { href: "OEBPS/chapter008.xhtml#page132", title: "132" },
    { href: "OEBPS/chapter008.xhtml#page133", title: "133" },
    { href: "OEBPS/chapter008.xhtml#page134", title: "134" },
    { href: "OEBPS/chapter008.xhtml#page135", title: "135" },
    { href: "OEBPS/chapter008.xhtml#page136", title: "136" },
    { href: "OEBPS/chapter008.xhtml#page137", title: "137" },
    { href: "OEBPS/chapter008.xhtml#page138", title: "138" },
    { href: "OEBPS/chapter008.xhtml#page139", title: "139" },
    { href: "OEBPS/chapter008.xhtml#page140", title: "140" },
    { href: "OEBPS/chapter008.xhtml#page141", title: "141" },
    { href: "OEBPS/chapter008.xhtml#page142", title: "142" },
    { href: "OEBPS/chapter008.xhtml#page143", title: "143" },
    { href: "OEBPS/chapter008.xhtml#page144", title: "144" },
    { href: "OEBPS/chapter008.xhtml#page145", title: "145" },
    { href: "OEBPS/chapter008.xhtml#page146", title: "146" },
    { href: "OEBPS/chapter008.xhtml#page147", title: "147" },
    { href: "OEBPS/chapter008.xhtml#page148", title: "148" },
    { href: "OEBPS/chapter008.xhtml#page149", title: "149" },
    { href: "OEBPS/chapter008.xhtml#page150", title: "150" },
    { href: "OEBPS/chapter009.xhtml#page152", title: "152" },
    { href: "OEBPS/chapter009.xhtml#page153", title: "153" },
    { href: "OEBPS/chapter009.xhtml#page154", title: "154" },
    { href: "OEBPS/chapter009.xhtml#page155", title: "155" },
    { href: "OEBPS/chapter009.xhtml#page156", title: "156" },
    { href: "OEBPS/chapter009.xhtml#page157", title: "157" },
    { href: "OEBPS/chapter010.xhtml#page158", title: "158" },
    { href: "OEBPS/part003.xhtml#page160", title: "160" },
    { href: "OEBPS/chapter011.xhtml#page162", title: "162" },
    { href: "OEBPS/chapter011.xhtml#page163", title: "163" },
    { href: "OEBPS/chapter011.xhtml#page164", title: "164" },
    { href: "OEBPS/chapter011.xhtml#page165", title: "165" },
    { href: "OEBPS/chapter011.xhtml#page166", title: "166" },
    { href: "OEBPS/chapter011.xhtml#page167", title: "167" },
    { href: "OEBPS/chapter011.xhtml#page168", title: "168" },
    { href: "OEBPS/chapter011.xhtml#page169", title: "169" },
    { href: "OEBPS/chapter011.xhtml#page170", title: "170" },
    { href: "OEBPS/chapter011.xhtml#page171", title: "171" },
    { href: "OEBPS/chapter011.xhtml#page172", title: "172" },
    { href: "OEBPS/chapter011.xhtml#page173", title: "173" },
    { href: "OEBPS/chapter011.xhtml#page174", title: "174" },
    { href: "OEBPS/chapter011.xhtml#page175", title: "175" },
    { href: "OEBPS/chapter011.xhtml#page176", title: "176" },
    { href: "OEBPS/chapter012.xhtml#page178", title: "178" },
    { href: "OEBPS/chapter012.xhtml#page179", title: "179" },
    { href: "OEBPS/chapter012.xhtml#page180", title: "180" },
    { href: "OEBPS/chapter012.xhtml#page181", title: "181" },
    { href: "OEBPS/chapter012.xhtml#page182", title: "182" },
    { href: "OEBPS/chapter012.xhtml#page183", title: "183" },
    { href: "OEBPS/chapter012.xhtml#page184", title: "184" },
    { href: "OEBPS/chapter012.xhtml#page185", title: "185" },
    { href: "OEBPS/chapter012.xhtml#page186", title: "186" },
    { href: "OEBPS/chapter012.xhtml#page187", title: "187" },
    { href: "OEBPS/chapter012.xhtml#page188", title: "188" },
    { href: "OEBPS/chapter012.xhtml#page189", title: "189" },
    { href: "OEBPS/chapter012.xhtml#page190", title: "190" },
    { href: "OEBPS/chapter012.xhtml#page191", title: "191" },
    { href: "OEBPS/chapter012.xhtml#page192", title: "192" },
    { href: "OEBPS/chapter012.xhtml#page193", title: "193" },
    { href: "OEBPS/chapter012.xhtml#page194", title: "194" },
    { href: "OEBPS/chapter012.xhtml#page195", title: "195" },
    { href: "OEBPS/chapter013.xhtml#page196", title: "196" },
    { href: "OEBPS/chapter013.xhtml#page197", title: "197" },
    { href: "OEBPS/chapter013.xhtml#page198", title: "198" },
    { href: "OEBPS/chapter013.xhtml#page199", title: "199" },
    { href: "OEBPS/chapter013.xhtml#page200", title: "200" },
    { href: "OEBPS/chapter013.xhtml#page201", title: "201" },
    { href: "OEBPS/chapter013.xhtml#page202", title: "202" },
    { href: "OEBPS/chapter013.xhtml#page203", title: "203" },
    { href: "OEBPS/chapter013.xhtml#page204", title: "204" },
    { href: "OEBPS/chapter013.xhtml#page205", title: "205" },
    { href: "OEBPS/chapter013.xhtml#page206", title: "206" },
    { href: "OEBPS/chapter013.xhtml#page207", title: "207" },
    { href: "OEBPS/chapter013.xhtml#page208", title: "208" },
    { href: "OEBPS/chapter013.xhtml#page209", title: "209" },
    { href: "OEBPS/chapter014.xhtml#page210", title: "210" },
    { href: "OEBPS/chapter014.xhtml#page211", title: "211" },
    { href: "OEBPS/chapter014.xhtml#page212", title: "212" },
    { href: "OEBPS/chapter014.xhtml#page213", title: "213" },
    { href: "OEBPS/chapter014.xhtml#page214", title: "214" },
    { href: "OEBPS/chapter014.xhtml#page215", title: "215" },
    { href: "OEBPS/chapter014.xhtml#page216", title: "216" },
    { href: "OEBPS/chapter014.xhtml#page217", title: "217" },
    { href: "OEBPS/chapter014.xhtml#page218", title: "218" },
    { href: "OEBPS/chapter014.xhtml#page219", title: "219" },
    { href: "OEBPS/chapter014.xhtml#page220", title: "220" },
    { href: "OEBPS/chapter014.xhtml#page221", title: "221" },
    { href: "OEBPS/chapter015.xhtml#page222", title: "222" },
    { href: "OEBPS/chapter015.xhtml#page223", title: "223" },
    { href: "OEBPS/chapter015.xhtml#page224", title: "224" },
    { href: "OEBPS/chapter015.xhtml#page225", title: "225" },
    { href: "OEBPS/chapter015.xhtml#page226", title: "226" },
    { href: "OEBPS/chapter015.xhtml#page227", title: "227" },
    { href: "OEBPS/chapter015.xhtml#page228", title: "228" },
    { href: "OEBPS/chapter015.xhtml#page230", title: "230" },
    { href: "OEBPS/chapter015.xhtml#page231", title: "231" },
    { href: "OEBPS/chapter015.xhtml#page232", title: "232" },
    { href: "OEBPS/chapter015.xhtml#page233", title: "233" },
    { href: "OEBPS/appendix001.xhtml#page234", title: "234" },
    { href: "OEBPS/acknowledgements.xhtml#page236", title: "236" },
    { href: "OEBPS/acknowledgements.xhtml#page237", title: "237" },
    { href: "OEBPS/personblurb.xhtml#page262", title: "262" },
    { href: "OEBPS/praise.xhtml#pagei", title: "i" },
    { href: "OEBPS/praise.xhtml#pageii", title: "ii" },
    { href: "OEBPS/praise.xhtml#pageiii", title: "iii" },
    { href: "OEBPS/praise.xhtml#pageiv", title: "iv" },
  ],
  readingOrder: [
    { href: "OEBPS/cover.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/titlepage.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/copyright.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/toc.xhtml", rel: "contents", type: "application/xhtml+xml" },
    { href: "OEBPS/dedication.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/discover-page_pre.xhtml", type: "application/xhtml+xml" },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fintroduction.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/introduction.xhtml",
      type: "application/xhtml+xml",
    },
    { href: "OEBPS/part001.xhtml", type: "application/xhtml+xml" },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter001.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter001.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter002.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter002.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter003.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter003.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter004.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter004.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter005.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter005.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter006.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter006.xhtml",
      type: "application/xhtml+xml",
    },
    { href: "OEBPS/part002.xhtml", type: "application/xhtml+xml" },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter007.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter007.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter008.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter008.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter009.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter009.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter010.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter010.xhtml",
      type: "application/xhtml+xml",
    },
    { href: "OEBPS/part003.xhtml", type: "application/xhtml+xml" },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter011.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter011.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter012.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter012.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter013.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter013.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter014.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter014.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fchapter015.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/chapter015.xhtml",
      type: "application/xhtml+xml",
    },
    {
      alternate: [
        {
          href: "~readium/guided-navigation.json?ref=OEBPS%2Fappendix001.xhtml",
          type: "application/guided-navigation+json",
        },
      ],
      href: "OEBPS/appendix001.xhtml",
      type: "application/xhtml+xml",
    },
    { href: "OEBPS/acknowledgements.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/discover-page.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/personblurb.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/appendix003.xhtml", type: "application/xhtml+xml" },
    { href: "OEBPS/praise.xhtml", type: "application/xhtml+xml" },
  ],
  resources: [
    {
      href: "OEBPS/images/9780316595667.jpg",
      rel: "cover",
      type: "image/jpeg",
    },
    { href: "OEBPS/css/stylesheet.css", type: "text/css" },
    { href: "OEBPS/toc.ncx", type: "application/x-dtbncx+xml" },
    { href: "OEBPS/css/discover-page.css", type: "text/css" },
    { href: "OEBPS/images/publisher-logo.png", type: "image/png" },
    { href: "OEBPS/images/Art_tit.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_sborn.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P13.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P28.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P43.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P76.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P54.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P92.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P114.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P158.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P176.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_sborn1.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P193.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P207.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P219.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P228a.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_P228b.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_smi.jpg", type: "image/jpeg" },
    { href: "OEBPS/images/Art_smi1.jpg", type: "image/jpeg" },
    { href: "OEBPS/Audio/00001-00004.mp4", type: "audio/mp4" },
    { href: "OEBPS/Audio/00001-00003.mp4", type: "audio/mp4" },
    {
      duration: 1328.61,
      href: "OEBPS/MediaOverlays/introduction.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00005.mp4", type: "audio/mp4" },
    { href: "OEBPS/Audio/00001-00006.mp4", type: "audio/mp4" },
    {
      duration: 1264.39,
      href: "OEBPS/MediaOverlays/chapter001.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00007.mp4", type: "audio/mp4" },
    {
      duration: 1563.04,
      href: "OEBPS/MediaOverlays/chapter002.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00008.mp4", type: "audio/mp4" },
    {
      duration: 3393.85,
      href: "OEBPS/MediaOverlays/chapter003.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00009.mp4", type: "audio/mp4" },
    {
      duration: 3423.15,
      href: "OEBPS/MediaOverlays/chapter004.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00010.mp4", type: "audio/mp4" },
    {
      duration: 1762.53,
      href: "OEBPS/MediaOverlays/chapter005.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00012.mp4", type: "audio/mp4" },
    {
      duration: 2272.37,
      href: "OEBPS/MediaOverlays/chapter006.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00013.mp4", type: "audio/mp4" },
    {
      duration: 3498.82,
      href: "OEBPS/MediaOverlays/chapter007.smil",
      type: "application/smil+xml",
    },
    {
      duration: 3509.77,
      href: "OEBPS/MediaOverlays/chapter008.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00014.mp4", type: "audio/mp4" },
    {
      duration: 624.81,
      href: "OEBPS/MediaOverlays/chapter009.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00016.mp4", type: "audio/mp4" },
    { href: "OEBPS/Audio/00001-00015.mp4", type: "audio/mp4" },
    {
      duration: 140.07,
      href: "OEBPS/MediaOverlays/chapter010.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00017.mp4", type: "audio/mp4" },
    { href: "OEBPS/Audio/00001-00018.mp4", type: "audio/mp4" },
    {
      duration: 1644.5,
      href: "OEBPS/MediaOverlays/chapter011.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00019.mp4", type: "audio/mp4" },
    {
      duration: 1616.08,
      href: "OEBPS/MediaOverlays/chapter012.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00020.mp4", type: "audio/mp4" },
    {
      duration: 1312.5,
      href: "OEBPS/MediaOverlays/chapter013.smil",
      type: "application/smil+xml",
    },
    {
      duration: 1023.78,
      href: "OEBPS/MediaOverlays/chapter014.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00021.mp4", type: "audio/mp4" },
    {
      duration: 1064.12,
      href: "OEBPS/MediaOverlays/chapter015.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Audio/00001-00022.mp4", type: "audio/mp4" },
    {
      duration: 50.82,
      href: "OEBPS/MediaOverlays/appendix001.smil",
      type: "application/smil+xml",
    },
    { href: "OEBPS/Styles/storyteller-readaloud.css", type: "text/css" },
  ],
  toc: [
    { href: "OEBPS/cover.xhtml", title: "Cover" },
    { href: "OEBPS/titlepage.xhtml", title: "Title Page" },
    { href: "OEBPS/copyright.xhtml", title: "Copyright" },
    { href: "OEBPS/dedication.xhtml", title: "Dedication" },
    {
      href: "OEBPS/introduction.xhtml",
      title: "Introduction: Hard Calls and Easy Calls",
    },
    {
      children: [
        {
          href: "OEBPS/chapter001.xhtml",
          title: "Chapter 1: Humanity’s Special Power",
        },
        {
          href: "OEBPS/chapter002.xhtml",
          title: "Chapter 2: Grown, Not Crafted",
        },
        {
          href: "OEBPS/chapter003.xhtml",
          title: "Chapter 3: Learning to Want",
        },
        {
          href: "OEBPS/chapter004.xhtml",
          title: "Chapter 4: You Don’t Get What You Train For",
        },
        {
          href: "OEBPS/chapter005.xhtml",
          title: "Chapter 5: Its Favorite Things",
        },
        { href: "OEBPS/chapter006.xhtml", title: "Chapter 6: We’d Lose" },
      ],
      href: "OEBPS/part001.xhtml",
      title: "PART I: NONHUMAN MINDS",
    },
    {
      children: [
        { href: "OEBPS/chapter007.xhtml", title: "Chapter 7: Realization" },
        { href: "OEBPS/chapter008.xhtml", title: "Chapter 8: Expansion" },
        { href: "OEBPS/chapter009.xhtml", title: "Chapter 9: Ascension" },
        { href: "OEBPS/chapter010.xhtml", title: "Coda" },
      ],
      href: "OEBPS/part002.xhtml",
      title: "PART II: ONE EXTINCTION SCENARIO",
    },
    {
      children: [
        {
          href: "OEBPS/chapter011.xhtml",
          title: "Chapter 10: A Cursed Problem",
        },
        {
          href: "OEBPS/chapter012.xhtml",
          title: "Chapter 11: An Alchemy, Not a Science",
        },
        {
          href: "OEBPS/chapter013.xhtml",
          title: "Chapter 12: “I Don’t Want to Be Alarmist”",
        },
        { href: "OEBPS/chapter014.xhtml", title: "Chapter 13: Shut It Down" },
        {
          href: "OEBPS/chapter015.xhtml",
          title: "Chapter 14: Where There’s Life, There’s Hope",
        },
      ],
      href: "OEBPS/part003.xhtml",
      title: "PART III: FACING THE CHALLENGE",
    },
    { href: "OEBPS/appendix001.xhtml", title: "Closing Words" },
    { href: "OEBPS/acknowledgements.xhtml", title: "Acknowledgments" },
    { href: "OEBPS/discover-page.xhtml", title: "Discover More" },
    { href: "OEBPS/personblurb.xhtml", title: "About the Authors" },
    { href: "OEBPS/appendix003.xhtml", title: "Notes" },
    {
      href: "OEBPS/praise.xhtml",
      title: 'Praise for "If Anyone Builds It, Everyone Dies"',
    },
  ],
}

void it.only("matches old one sorta", async (ctx) => {
  const { buildReportModel: buildReportModelOld } = await import(
    "@/alignmentReportView"
  )
  const overrides: AlignmentOverrides = {
    audioFiles: {
      "00001-00001.mp4": { ignored: true },
    },
    chapters: {
      "chapter001.xhtml": { ignored: true },
    },
  }
  const model = buildReportModelOld({
    report,
    overrides,
    ebookManifest: manifest,
  })
  const modelNew = buildReportModel({
    report,
    overrides,
    ebookManifest: manifest,
  })
  await writeFile("./new.json", JSON.stringify(modelNew, null, 2))
  await writeFile("./old.json", JSON.stringify(model, null, 2))
  ctx.assert.deepStrictEqual(model.summary, modelNew.summary)
})
