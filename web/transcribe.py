import whisperx


def transcribe(track_path, device, compute_type, batch_size, initial_prompt):
    transcribe_model = whisperx.load_model(
        "base.en",
        device=device,
        compute_type=compute_type,
        asr_options={"word_timestamps": True, "initial_prompt": initial_prompt},
    )
    align_model, align_metadata = whisperx.load_align_model(
        language_code="en", device=device
    )

    audio = whisperx.load_audio(track_path)

    unaligned = transcribe_model.transcribe(audio, batch_size=int(batch_size))
    transcription = whisperx.align(
        unaligned["segments"],
        align_model,
        align_metadata,
        audio,
        device=device,
        return_char_alignments=False,
    )

    return transcription
