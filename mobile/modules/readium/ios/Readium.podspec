Pod::Spec.new do |s|
  s.name           = 'Readium'
  s.version        = '0.0.1'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platform       = :ios, '13.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'R2Shared'
  s.dependency 'R2Streamer'
  s.dependency 'R2Navigator'
  s.dependency 'ReadiumOPDS'
  s.dependency 'ReadiumInternal'
  s.dependency 'ReadiumAdapterGCDWebServer'
  s.dependency 'ZIPFoundation'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
