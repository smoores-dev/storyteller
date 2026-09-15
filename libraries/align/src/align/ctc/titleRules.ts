import type { ExclusionVerdict, SpineZone } from "./exclusions.ts"

export type TitleRule = {
  match: string
  verdict: ExclusionVerdict
  zones: SpineZone[]
  patterns: Record<string, RegExp[]>
}

const EDGES = ["front", "back"] as const as SpineZone[]
const FRONT = ["front"] as const as SpineZone[]
const BACK = ["back"] as const as SpineZone[]
const ANYWHERE = ["front", "body", "back"] as const as SpineZone[]

function title(
  match: string,
  verdict: ExclusionVerdict,
  zones: SpineZone[],
  patterns: Record<string, RegExp[]>,
): TitleRule {
  return { match, verdict, zones, patterns }
}

export const TITLE_RULES: TitleRule[] = [
  title("copyright-page", "exclude", ANYWHERE, {
    en: [/^copyright( page| notice| information)?$/, /^legal notice$/],
    nl: [/^auteursrecht$/],
    de: [/^impressum$/, /^urheberrecht$/],
    fr: [/^mentions l[ée]gales$/, /^droits dauteur$/],
    es: [/^derechos de autor$/, /^aviso legal$/],
    it: [/^diritti dautore$/, /^note legali$/],
    pt: [/^direitos autorais$/, /^ficha t[ée]cnica$/],
  }),
  title("colophon", "exclude", ANYWHERE, {
    en: [/^colophon$/],
    nl: [/^colofon$/],
    es: [/^colof[óo]n$/],
  }),
  title("cover", "exclude", FRONT, {
    en: [/^(front )?cover$/],
    nl: [/^(voor)?omslag$/],
    de: [/^umschlag$/],
    fr: [/^couverture$/],
    es: [/^(cubierta|portada)$/],
    it: [/^copertina$/],
    pt: [/^capa$/],
  }),
  title("titlepage", "exclude", FRONT, {
    en: [/^(half )?title page$/],
    nl: [/^titelpagina$/],
    de: [/^titelseite$/],
    fr: [/^page de titre$/],
  }),
  title("toc", "exclude", EDGES, {
    en: [/^(table of )?contents$/],
    nl: [/^inhoud(sopgave)?$/],
    de: [/^inhalt(sverzeichnis)?$/],
    fr: [/^table des mati[èe]res$/, /^sommaire$/],
    es: [/^[íi]ndice$/, /^contenidos?$/],
    it: [/^indice$/, /^sommario$/],
    pt: [/^[íi]ndice$/, /^sum[áa]rio$/],
  }),
  title("maps", "exclude", EDGES, {
    en: [/^maps?$/, /^map of /],
    nl: [/^(land)?kaart(en)?$/],
    de: [/^karten?$/],
    fr: [/^cartes?$/],
    es: [/^mapas?$/],
    it: [/^(mappa|mappe|cartina|cartine)$/],
    pt: [/^mapas?$/],
  }),
  title("praise", "exclude", EDGES, {
    en: [/^(advance )?praise( for .+)?$/],
    nl: [/^(lof voor|pers over) /],
  }),
  title("also-by", "exclude", EDGES, {
    en: [/^(also|other books|more books) by /, /^by the same author$/],
    nl: [
      /^(ook|eerder verschenen) (van|bij) /,
      /^van dezelfde (auteur|schrijver)$/,
    ],
    de: [
      /^vom selben autor$/,
      /^von derselben autorin$/,
      /^weitere (b[üu]cher|titel) von /,
    ],
    fr: [/^du m[êe]me auteur$/],
    es: [/^del mismo autor$/, /^otr[oa]s (libros|obras) de /],
    it: [/^dello stesso autore$/],
    pt: [/^do mesmo autor$/, /^outros livros d[oa] /],
  }),
  title("about-the-author", "exclude", EDGES, {
    en: [/^about the authors?$/, /^meet the author$/],
    nl: [/^over de (auteurs?|schrijver)$/],
    de: [/^[üu]ber (den autor|die autorin)$/, /^(zum autor|zur autorin)$/],
    fr: [/^[àa] propos de lauteur$/],
    es: [/^(sobre el|acerca del) autora?$/],
    it: [/^nota biografica$/],
    pt: [/^sobre (o autor|a autora)$/],
  }),
  title("about-the-publisher", "exclude", EDGES, {
    en: [/^about the publisher$/],
    nl: [/^over de uitgever(ij)?$/],
    de: [/^[üu]ber den verlag$/],
  }),
  title("newsletter", "exclude", EDGES, {
    en: [
      /^(connect|follow) (with|on) /,
      /^(sign up|subscribe) (for|to) /,
      /^(newsletter|join our mailing list)$/,
    ],
    nl: [/^nieuwsbrief$/, /^volg (ons|de auteur) /],
  }),
  title("excerpt", "exclude", BACK, {
    en: [
      /^(an )?(excerpt|extract|preview|sample) (from|of) /,
      /^(read )?(an excerpt|a preview|a sneak peek)( .+)?$/,
      /^sneak peek$/,
    ],
    nl: [/^(een )?(fragment|voorproefje) (uit|van) /],
    de: [/^leseprobe( .+)?$/],
    fr: [/^(un )?extrait (de|du|des) /],
    es: [/^(un )?(fragmento|avance) de /],
    it: [/^(un )?(estratto|anteprima) (da|di) /],
    pt: [/^(um )?(trecho|excerto) de /],
  }),
  title("discussion-questions", "exclude", ANYWHERE, {
    en: [
      /^(discussion questions|questions for discussion)$/,
      /^(a )?(reading group|readers|book club) (guide|questions|kit)$/,
    ],
    nl: [
      /^(leesclubvragen|leesgroepvragen|discussievragen)$/,
      /^vragen voor de leesclub$/,
    ],
    de: [/^(fragen f[üu]r (den )?lesekreis|lesekreisfragen)$/],
    fr: [/^(guide de lecture|questions pour les clubs de lecture)$/],
    es: [/^gu[íi]a de lectura$/, /^preguntas para (el )?club de lectura$/],
    it: [/^guida alla lettura$/, /^domande per (il )?gruppo di lettura$/],
    pt: [/^guia de leitura$/, /^perguntas para (o )?clube de leitura$/],
  }),
  title("endnotes", "exclude", BACK, {
    en: [/^(end)?notes$/, /^(source )?notes( and)? sources$/],
    nl: [/^(noten|eindnoten|aantekeningen)$/],
    de: [/^(anmerkungen|endnoten)$/],
    fr: [/^notes$/],
    es: [/^notas$/],
    it: [/^note$/],
    pt: [/^notas$/],
  }),
  title("index", "exclude", BACK, {
    en: [/^(general )?index$/],
    nl: [/^(register|index)$/],
    de: [/^(register|index|stichwortverzeichnis|personenregister)$/],
    fr: [/^index$/],
    es: [/^[íi]ndice (alfab[ée]tico|onom[áa]stico|anal[íi]tico)$/],
    it: [/^indice (analitico|dei nomi)$/],
    pt: [/^[íi]ndice remissivo$/],
  }),
  title("bibliography", "exclude", BACK, {
    en: [
      /^((selected )?bibliography|references|works cited|sources|further reading)$/,
    ],
    nl: [
      /^(bibliografie|literatuur(lijst)?|bronnen|bronvermelding|verantwoording)$/,
    ],
    de: [
      /^(bibliographie|bibliografie|literatur(verzeichnis)?|quellen(verzeichnis)?)$/,
    ],
    fr: [/^(bibliographie|sources|r[ée]f[ée]rences)$/],
    es: [/^(bibliograf[íi]a|referencias|fuentes)$/],
    it: [/^(bibliografia|fonti)$/],
    pt: [/^(bibliografia|refer[êe]ncias|fontes)$/],
  }),
  title("glossary", "exclude", BACK, {
    en: [/^glossary$/],
    nl: [/^(verklarende )?woordenlijst$/],
    de: [/^glossar$/],
    fr: [/^glossaire$/],
    es: [/^glosario$/],
    it: [/^glossario$/],
    pt: [/^gloss[áa]rio$/],
  }),
  title("credits", "exclude", BACK, {
    en: [
      /^((photo|image|illustration|text) )?credits$/,
      /^permissions$/,
      /^a note on the type$/,
    ],
    nl: [/^(foto|beeld)verantwoording$/],
    es: [/^cr[ée]ditos$/],
    pt: [/^cr[ée]ditos$/],
  }),
  title("dedication", "review", EDGES, {
    en: [/^dedication$/],
    nl: [/^opdracht$/],
    de: [/^widmung$/],
    fr: [/^d[ée]dicace$/],
    es: [/^dedicatoria$/],
    it: [/^dedica$/],
    pt: [/^dedicat[óo]ria$/],
  }),
  title("epigraph", "review", EDGES, {
    en: [/^epigraphs?$/],
    nl: [/^motto$/],
    de: [/^motto$/],
    fr: [/^[ée]pigraphe$/],
    es: [/^ep[íi]grafe$/],
    it: [/^epigrafe$/],
    pt: [/^ep[íi]grafe$/],
  }),
  title("acknowledgments", "review", EDGES, {
    en: [/^acknowledge?ments?$/],
    nl: [/^(dankwoord|dankbetuiging)$/],
    de: [/^dank(sagung)?$/],
    fr: [/^remerciements?$/],
    es: [/^agradecimientos?$/],
    it: [/^ringraziamenti$/],
    pt: [/^agradecimentos?$/],
  }),
  title("foreword", "review", EDGES, {
    en: [/^foreword$/],
    nl: [/^voorwoord$/],
    de: [/^vorwort$/],
    fr: [/^avant propos$/],
  }),
  title("preface", "review", EDGES, {
    en: [/^preface$/],
    fr: [/^pr[ée]face$/],
    es: [/^prefacio$/],
    it: [/^prefazione$/],
    pt: [/^pref[áa]cio$/],
  }),
  title("introduction", "review", EDGES, {
    en: [/^introduction$/],
    nl: [/^inleiding$/],
    de: [/^einleitung$/],
    fr: [/^introduction$/],
    es: [/^introducci[óo]n$/],
    it: [/^introduzione$/],
    pt: [/^introdu[çc][ãa]o$/],
  }),
  title("authors-note", "review", EDGES, {
    en: [/^(a )?note (from|by) the author$/, /^authors? note$/],
    nl: [/^(noot|woord) van de (auteur|schrijver)$/],
    de: [/^anmerkung (des autors|der autorin)$/],
    fr: [/^note de lauteur$/],
    es: [/^nota del autor$/],
    it: [/^nota dellautore$/],
    pt: [/^nota do autor$/],
  }),
  title("afterword", "review", BACK, {
    en: [/^afterword$/],
    nl: [/^nawoord$/],
    de: [/^nachwort$/],
    fr: [/^postface$/],
    it: [/^postfazione$/],
    pt: [/^posf[áa]cio$/],
  }),
  title("appendix", "review", BACK, {
    en: [/^appendix( [a-z0-9]+)?$/, /^appendices$/],
    nl: [/^(bijlage|appendix)( [a-z0-9]+)?$/],
    de: [/^anhang( [a-z0-9]+)?$/],
    fr: [/^annexes?( [a-z0-9]+)?$/],
    es: [/^ap[ée]ndices?( [a-z0-9]+)?$/],
    it: [/^appendic[ei]( [a-z0-9]+)?$/],
    pt: [/^ap[êe]ndices?( [a-z0-9]+)?$/],
  }),
]
