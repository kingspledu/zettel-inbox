import importlib.util, json, unittest, tempfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location("collector","local-collector.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_urls(self):
  self.assertEqual(m.post_url("https://www.instagram.com/p/abcdef/?x=1"),"https://www.instagram.com/p/abcdef/")
  for url in ["https://evil.test/p/abcdef/","http://www.instagram.com/p/abcdef/","https://user@www.instagram.com/p/abcdef/"]:
   with self.assertRaises(ValueError):m.post_url(url)
 def test_carousel_and_cover(self):
  post=SimpleNamespace(caption="원문",typename="GraphSidecar",is_video=False,url="https://s.cdninstagram.com/cover.jpg",get_sidecar_nodes=lambda:[SimpleNamespace(is_video=False,display_url="https://s.cdninstagram.com/1.jpg"),SimpleNamespace(is_video=False,display_url="https://s.cdninstagram.com/2.jpg")])
  with patch.object(m.instaloader.Post,"from_shortcode",return_value=post):
   images=m.extract("https://www.instagram.com/p/abcdef/");self.assertEqual(len(images["images"]),2);self.assertEqual(images["caption"],"원문")
   reel=m.extract("https://www.instagram.com/reel/abcdef/");self.assertEqual(reel["images"],[]);self.assertEqual(reel["cover_image"],post.url)
 def test_auth_and_private_paths(self):
  self.assertFalse(m.authenticated(""))
  with self.assertRaises(ValueError):m.attachment(dict(repository="evil/repo",path="x",sha="a"*40))
 def test_local_gh_upload(self):
  calls=[]
  def gh(args,payload=None,binary=False):
   calls.append((args,payload));return {"private":True} if args==["api","repos/"+m.REPO] else {"commit":{"sha":"a"*40}}
  with tempfile.TemporaryDirectory() as temp,patch.object(m,"CACHE",Path(temp)),patch.object(m,"image_bytes",return_value=(b"image-data","image/jpeg")),patch.object(m,"gh",side_effect=gh):
   result=m.archive("https://s.cdninstagram.com/a.jpg")
   self.assertEqual(result["size"],10);self.assertEqual(result["github"]["repository"],m.REPO);self.assertNotIn("token",json.dumps(result))
   self.assertEqual(json.loads(calls[1][1])["content"],"aW1hZ2UtZGF0YQ==")
if __name__=="__main__":unittest.main()
