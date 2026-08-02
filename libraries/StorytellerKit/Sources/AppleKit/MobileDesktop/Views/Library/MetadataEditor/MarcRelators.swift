#if os(iOS) || os(macOS)
import SwiftUI

struct MarcRelator: Identifiable, Hashable {
    let label: String
    let code: String

    var id: String { code }
    var displayName: String { "\(label) (\(code))" }
}

enum MarcRelators {
    static let creatorRelators: [MarcRelator] =
        rawCreatorRelators
        .split(separator: "\n")
        .compactMap { line in
            let parts = line.split(separator: "|", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return nil }
            return MarcRelator(label: parts[0], code: parts[1])
        }

    private static let rawCreatorRelators = """
        Abridger|abr
        Actor|act
        Adapter|adp
        Addressee|rcp
        Analyst|anl
        Animator|anm
        Annotator|ann
        Announcer|anc
        Appellant|apl
        Appellee|ape
        Applicant|app
        Architect|arc
        Arranger|arr
        Art copyist|acp
        Art director|adi
        Artist|art
        Artistic director|ard
        Assignee|asg
        Associated name|asn
        Attributed name|att
        Auctioneer|auc
        Audio engineer|aue
        Audio producer|aup
        Author in quotations or text abstracts|aqt
        Author of dialog|aud
        Autographer|ato
        Bibliographic antecedent|ant
        Binder|bnd
        Binding designer|bdd
        Blurb writer|blw
        Book artist|bka
        Book designer|bkd
        Book producer|bkp
        Bookjacket designer|bjd
        Bookplate designer|bpd
        Bookseller|bsl
        Braille embosser|brl
        Broadcaster|brd
        Calligrapher|cll
        Camera operator|cop
        Cartographer|ctg
        Caster|cas
        Casting director|cad
        Censor|cns
        Choreographer|chr
        Cinematographer|cng
        Client|cli
        Collection registrar|cor
        Collector|col
        Collotyper|clt
        Colorist|clr
        Commentator|cmm
        Commentator for written text|cwt
        Compiler|com
        Complainant|cpl
        Complainant-appellant|cpt
        Complainant-appellee|cpe
        Composer|cmp
        Compositor|cmt
        Conceptor|ccp
        Conductor|cnd
        Conservator|con
        Consultant|csl
        Consultant to a project|csp
        Contestant|cos
        Contestant-appellant|cot
        Contestant-appellee|coe
        Contestee|cts
        Contestee-appellant|ctt
        Contestee-appellee|cte
        Contractor|ctr
        Contributor|ctb
        Copyright claimant|cpc
        Copyright holder|cph
        Corrector|crr
        Correspondent|crp
        Costume designer|cst
        Court governed|cou
        Court reporter|crt
        Cover designer|cov
        Creator|cre
        Curator|cur
        Dancer|dnc
        Data contributor|dtc
        Data manager|dtm
        Dedicatee|dte
        Dedicator|dto
        Defendant|dfd
        Defendant-appellant|dft
        Defendant-appellee|dfe
        Degree committee member|dgc
        Degree granting institution|dgg
        Degree supervisor|dgs
        Delineator|dln
        Depicted|dpc
        Depositor|dpt
        Designer|dsr
        Director|drt
        Dissertant|dis
        Distribution place|dbp
        Distributor|dst
        Dj|djo
        Donor|dnr
        Draftsman|drm
        Dubbing director|dbd
        Dubious author|dub
        Editor|edt
        Editor of compilation|edc
        Editor of moving image work|edm
        Editorial director|edd
        Electrician|elg
        Electrotyper|elt
        Enacting jurisdiction|enj
        Engineer|eng
        Engraver|egr
        Etcher|etr
        Event place|evp
        Expert|exp
        Facsimilist|fac
        Field director|fld
        Film director|fmd
        Film distributor|fds
        Film editor|flm
        Film producer|fmp
        Filmmaker|fmk
        First party|fpy
        Forger|frg
        Former owner|fmo
        Founder|fon
        Funder|fnd
        Game developer|gdv
        Geographic information specialist|gis
        Honoree|hnr
        Host|hst
        Host institution|his
        Illuminator|ilu
        Illustrator|ill
        Inker|ink
        Inscriber|ins
        Instrumentalist|itr
        Interviewee|ive
        Interviewer|ivr
        Inventor|inv
        Issuing body|isb
        Judge|jud
        Jurisdiction governed|jug
        Laboratory|lbr
        Laboratory director|ldr
        Landscape architect|lsa
        Lead|led
        Lender|len
        Letterer|ltr
        Libelant|lil
        Libelant-appellant|lit
        Libelant-appellee|lie
        Libelee|lel
        Libelee-appellant|let
        Libelee-appellee|lee
        Librettist|lbt
        Licensee|lse
        Licensor|lso
        Lighting designer|lgd
        Lithographer|ltg
        Lyricist|lyr
        Makeup artist|mka
        Manufacture place|mfp
        Manufacturer|mfr
        Marbler|mrb
        Markup editor|mrk
        Medium|med
        Metadata contact|mdc
        Metal-engraver|mte
        Minute taker|mtk
        Mixing engineer|mxe
        Moderator|mod
        Monitor|mon
        Music copyist|mcp
        Music programmer|mup
        Musical director|msd
        Musician|mus
        News anchor|nan
        Onscreen participant|onp
        Onscreen presenter|osp
        Opponent|opn
        Organizer|orm
        Originator|org
        Other|oth
        Owner|own
        Panelist|pan
        Papermaker|ppm
        Patent applicant|pta
        Patent holder|pth
        Patron|pat
        Penciller|pnc
        Performer|prf
        Permitting agency|pma
        Photographer|pht
        Place of address|pad
        Plaintiff|ptf
        Plaintiff-appellant|ptt
        Plaintiff-appellee|pte
        Platemaker|plt
        Praeses|pra
        Presenter|pre
        Printer|prt
        Printer of plates|pop
        Printmaker|prm
        Process contact|prc
        Producer|pro
        Production company|prn
        Production designer|prs
        Production manager|pmn
        Production personnel|prd
        Production place|prp
        Programmer|prg
        Project director|pdr
        Proofreader|pfr
        Provider|prv
        Publication place|pup
        Publisher|pbl
        Publishing director|pbd
        Puppeteer|ppt
        Radio director|rdd
        Radio producer|rpc
        Rapporteur|rap
        Recording engineer|rce
        Recordist|rcd
        Redaktor|red
        Remix artist|rxa
        Renderer|ren
        Reporter|rpt
        Repository|rps
        Research team head|rth
        Research team member|rtm
        Researcher|res
        Respondent|rsp
        Respondent-appellant|rst
        Respondent-appellee|rse
        Responsible party|rpy
        Restager|rsg
        Restorationist|rsr
        Reviewer|rev
        Rubricator|rbr
        Scenarist|sce
        Scientific advisor|sad
        Screenwriter|aus
        Scribe|scr
        Sculptor|scl
        Second party|spy
        Secretary|sec
        Seller|sll
        Set designer|std
        Setting|stg
        Signer|sgn
        Singer|sng
        Software developer|swd
        Sound designer|sds
        Sound engineer|sde
        Speaker|spk
        Special effects provider|sfx
        Sponsor|spn
        Stage director|sgd
        Stage manager|stm
        Standards body|stn
        Stereotyper|str
        Storyteller|stl
        Supporting host|sht
        Surveyor|srv
        Teacher|tch
        Technical advisor|tad
        Technical director|tcd
        Television director|tld
        Television guest|tlg
        Television host|tlh
        Television producer|tlp
        Television writer|tau
        Thesis advisor|ths
        Transcriber|trc
        Translator|trl
        Type designer|tyd
        Typographer|tyg
        University place|uvp
        Videographer|vdg
        Visual effects provider|vfx
        Voice actor|vac
        Witness|wit
        Wood engraver|wde
        Woodcutter|wdc
        Writer of accompanying material|wam
        Writer of added commentary|wac
        Writer of added lyrics|wal
        Writer of added text|wat
        Writer of afterword|waw
        Writer of film story|wfs
        Writer of foreword|wfw
        Writer of intertitles|wft
        Writer of introduction|win
        Writer of preface|wpr
        Writer of supplementary textual content|wst
        Writer of television story|wts
        """
}

struct MarcRelatorRoleEditor: View {
    @Binding var role: String

    var body: some View {
        Menu {
            ForEach(MarcRelators.creatorRelators) { relator in
                Button(relator.displayName) {
                    role = relator.code
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selectedCode)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
    }

    private var selectedCode: String {
        role.isEmpty ? "Role" : role
    }
}

#endif
